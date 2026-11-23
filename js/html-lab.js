import { api } from './api.js?v=20261123l';
import { MATH_CURRICULUM, findLessonInfo } from './curriculum-data.js?v=20261123d';
import { escapeHtml, escapeAttr } from './exam-engine.js?v=20261123d';

const VISIBILITY_OPTIONS = [
  { value: 'admin_only', label: 'Chỉ mình tôi' },
  { value: 'own_grade', label: 'HS chỉ xem được khối lớp của mình' },
  { value: 'all_grades', label: 'HS xem được tất cả khối lớp' },
];

const HTML2CANVAS_PRO_URL = 'https://cdn.jsdelivr.net/npm/html2canvas-pro@1.5.11/dist/html2canvas-pro.min.js';
const HTML2CANVAS_FALLBACK_URL = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
let h2cPromise = null;

function loadHtml2Canvas() {
  if (typeof window.html2canvas === 'function') return Promise.resolve(window.html2canvas);
  if (!h2cPromise) {
    const loadScript = (src) =>
      new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = () => (typeof window.html2canvas === 'function' ? resolve(window.html2canvas) : reject(new Error('html2canvas unavailable')));
        s.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(s);
      });
    h2cPromise = loadScript(HTML2CANVAS_PRO_URL).catch(() => loadScript(HTML2CANVAS_FALLBACK_URL));
  }
  return h2cPromise;
}

function encodeCrispThumbnail(sourceCanvas, targetW = 720, targetH = 450) {
  const out = document.createElement('canvas');
  out.width = targetW;
  out.height = targetH;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // Cover-fit sourceCanvas into 16:10 target frame cleanly
  const srcRatio = sourceCanvas.width / Math.max(1, sourceCanvas.height);
  const dstRatio = targetW / targetH;
  let sx = 0, sy = 0, sw = sourceCanvas.width, sh = sourceCanvas.height;
  if (srcRatio > dstRatio) {
    sw = Math.round(sourceCanvas.height * dstRatio);
    sx = Math.round((sourceCanvas.width - sw) / 2);
  } else if (srcRatio < dstRatio) {
    sh = Math.round(sourceCanvas.width / dstRatio);
    sy = 0;
  }
  ctx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, targetW, targetH);

  // Prefer WebP (30-45% smaller than JPEG at identical sharpness); fallback to JPEG
  const webp = out.toDataURL('image/webp', 0.82);
  if (webp.startsWith('data:image/webp')) return webp;
  return out.toDataURL('image/jpeg', 0.82);
}

function canvasHasVisualContent(canvas) {
  try {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    if (!w || !h) return false;
    const sample = ctx.getImageData(0, 0, Math.min(w, 64), Math.min(h, 64)).data;
    let firstR = sample[0], firstG = sample[1], firstB = sample[2];
    for (let i = 4; i < sample.length; i += 16) {
      if (Math.abs(sample[i] - firstR) > 6 || Math.abs(sample[i + 1] - firstG) > 6 || Math.abs(sample[i + 2] - firstB) > 6) {
        return true;
      }
    }
    // Also check center strip
    const mid = ctx.getImageData(Math.floor(w * 0.25), Math.floor(h * 0.25), Math.min(w >> 1, 80), Math.min(h >> 1, 80)).data;
    for (let i = 0; i < mid.length; i += 16) {
      if (Math.abs(mid[i] - firstR) > 6 || Math.abs(mid[i + 1] - firstG) > 6 || Math.abs(mid[i + 2] - firstB) > 6) {
        return true;
      }
    }
    return false;
  } catch {
    return true;
  }
}

/**
 * Automatically render a model at full desktop widescreen (1280x800) in an offscreen
 * same-origin iframe (with WebGL preserveDrawingBuffer), capture the full scene + UI,
 * and downscale to a crisp lightweight 720x450 WebP/JPEG (~25-45 KB).
 */
async function captureModelThumbnail(modelId, { width = 720, height = 450 } = {}) {
  const h2c = await loadHtml2Canvas();
  const CAP_W = 1280;
  const CAP_H = 800;

  const iframe = document.createElement('iframe');
  iframe.style.cssText = `position:fixed;left:-12000px;top:0;width:${CAP_W}px;height:${CAP_H}px;border:none;opacity:0.01;pointer-events:none;z-index:-1;background:#ffffff;`;
  document.body.appendChild(iframe);

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(), 6500);
      iframe.addEventListener(
        'load',
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true }
      );
      iframe.addEventListener(
        'error',
        () => {
          clearTimeout(timer);
          reject(new Error('Không thể tải mô hình để chụp ảnh.'));
        },
        { once: true }
      );
      iframe.src = `/model/${encodeURIComponent(modelId)}?capture=1&r=${Date.now()}`;
    });

    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    if (!doc || !doc.body) {
      throw new Error('Không thể truy cập nội dung mô hình để chụp.');
    }

    // Wait for fonts + ~30 animation frames (~900ms) so Three.js WebGL scene finishes painting
    if (doc.fonts?.ready) {
      await Promise.race([doc.fonts.ready, new Promise((r) => setTimeout(r, 800))]);
    }
    await new Promise((resolve) => {
      let ticks = 0;
      const start = Date.now();
      const step = () => {
        ticks++;
        if ((ticks >= 24 && Date.now() - start >= 650) || Date.now() - start >= 1800) {
          resolve();
          return;
        }
        (win?.requestAnimationFrame || window.requestAnimationFrame)(step);
      };
      (win?.requestAnimationFrame || window.requestAnimationFrame)(step);
    });

    let capturedCanvas = null;
    try {
      capturedCanvas = await h2c(doc.documentElement, {
        width: CAP_W,
        height: CAP_H,
        windowWidth: CAP_W,
        windowHeight: CAP_H,
        x: 0,
        y: 0,
        scale: 1,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        logging: false,
      });
    } catch {
      capturedCanvas = null;
    }

    // Fallback: composite inner <canvas> elements directly if html2canvas fails on cross-origin assets
    if (!capturedCanvas || !canvasHasVisualContent(capturedCanvas)) {
      const innerCanvases = Array.from(doc.querySelectorAll('canvas'));
      if (innerCanvases.length > 0) {
        const fb = document.createElement('canvas');
        fb.width = CAP_W;
        fb.height = CAP_H;
        const fctx = fb.getContext('2d');
        fctx.fillStyle = getComputedStyle(doc.body).backgroundColor || '#ffffff';
        fctx.fillRect(0, 0, CAP_W, CAP_H);
        for (const c of innerCanvases) {
          const r = c.getBoundingClientRect();
          if (r.width > 10 && r.height > 10) {
            try {
              fctx.drawImage(c, r.left, r.top, r.width, r.height);
            } catch {
              // ignore tainted canvas
            }
          }
        }
        capturedCanvas = fb;
      }
    }

    if (!capturedCanvas) {
      throw new Error('Không thể dựng ảnh chụp xem trước từ mô hình này.');
    }

    return encodeCrispThumbnail(capturedCanvas, width, height);
  } finally {
    // Release WebGL context & DOM cleanly
    try {
      iframe.src = 'about:blank';
    } catch {
      // ignore
    }
    iframe.remove();
  }
}

/**
 * Resize an uploaded preview image to a crisp lightweight WebP/JPEG data URL (720px wide)
 * so it loads instantaneously and stays compact in Supabase/local storage.
 */
function compressImageToDataUrl(file, maxWidth = 720) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / (img.width || maxWidth));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        const webp = canvas.toDataURL('image/webp', 0.82);
        resolve(webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => reject(new Error('Không thể đọc file ảnh xem trước.'));
      img.src = String(reader.result || '');
    };
    reader.onerror = () => reject(new Error('Lỗi đọc file ảnh.'));
    reader.readAsDataURL(file);
  });
}

export function createHtmlLabController({
  rootEl,
  uiHelpers,
  getUser,
  getVisibilityMode,
  onRouteChange,
  onVisibilityModeChanged,
}) {
  const { showToast, openModal, closeModal } = uiHelpers;

  const state = {
    models: [],
    grade: '12', // '10' | '11' | '12'
    mode: 'showcase', // 'showcase' (Trình bày - default) | 'manage' (Chỉnh sửa - admin only)
    visibilityMode: 'admin_only', // fail-closed until server confirms actual mode
    studentGrade: '',
    search: '',
    collapsedChapters: new Set(),
    hasInitializedGrade: false,
    renderRev: Date.now(),
  };

  let previewObserver = null;
  let previewSessionId = 0;
  let fetchSeq = 0;
  let lastLoadedUserId = '';

  function reset() {
    fetchSeq += 1;
    previewSessionId += 1;
    if (previewObserver) {
      previewObserver.disconnect();
      previewObserver = null;
    }
    state.models = [];
    state.studentGrade = '';
    state.hasInitializedGrade = false;
    state.mode = 'showcase';
    state.search = '';
    state.collapsedChapters.clear();
    state.visibilityMode = getVisibilityMode?.() || 'admin_only';
    lastLoadedUserId = '';
    if (rootEl) rootEl.innerHTML = '';
  }

  function isAdmin() {
    return getUser?.()?.role === 'admin';
  }

  function getStudentGrade() {
    if (state.studentGrade && ['10', '11', '12'].includes(String(state.studentGrade))) {
      return String(state.studentGrade);
    }
    const cls = String(getUser?.()?.className || '').trim();
    const m = cls.match(/(10|11|12)/);
    return m ? m[1] : '';
  }

  function getAllowedGrades() {
    if (isAdmin() || state.visibilityMode === 'all_grades') return ['10', '11', '12'];
    if (state.visibilityMode === 'own_grade') {
      const g = getStudentGrade();
      return g ? [g] : [];
    }
    return [];
  }

  async function init(routeOpts = null) {
    const curUserId = String(getUser?.()?.id || '');
    const latestVis = getVisibilityMode?.();
    if (latestVis) state.visibilityMode = latestVis;

    // Never keep or flash stale/unauthorized DOM/models (always fail-closed for non-admin before fresh fetch)
    if (!isAdmin() || !curUserId || curUserId !== lastLoadedUserId || state.models.length === 0) {
      reset();
      if (latestVis) state.visibilityMode = latestVis;
      if (rootEl) {
        rootEl.innerHTML = `
          <div class="lab-shell">
            <div class="card lab-empty-state" style="padding:36px;">
              <p style="margin:0; color:var(--text-muted);">Đang tải thư viện mô hình...</p>
            </div>
          </div>
        `;
      }
    }

    const preAllowed = getAllowedGrades();
    if (routeOpts?.grade && ['10', '11', '12'].includes(String(routeOpts.grade))) {
      if (isAdmin() || preAllowed.includes(String(routeOpts.grade))) {
        state.grade = String(routeOpts.grade);
        state.hasInitializedGrade = true;
      }
    } else if (!isAdmin() && preAllowed.length > 0 && !preAllowed.includes(state.grade)) {
      state.grade = preAllowed[0];
    }
    state.mode = routeOpts?.manage && isAdmin() ? 'manage' : 'showcase';
    await refresh(!routeOpts?.grade, curUserId);
  }

  async function refresh(autoPickGrade = false, expectedUserId = null) {
    const reqSeq = ++fetchSeq;
    const targetUid = expectedUserId !== null ? expectedUserId : String(getUser?.()?.id || '');
    try {
      const res = await api.getModels();
      // Abort if user logged out/switched or a newer request superseded this one
      if (reqSeq !== fetchSeq || String(getUser?.()?.id || '') !== targetUid) return;

      state.models = Array.isArray(res.models) ? res.models : [];
      if (res.modelsVisibilityMode) {
        state.visibilityMode = res.modelsVisibilityMode;
        onVisibilityModeChanged?.(state.visibilityMode);
      }
      if (typeof res.studentGrade === 'string') {
        state.studentGrade = res.studentGrade;
      }
      lastLoadedUserId = targetUid;
      state.renderRev = Date.now();
    } catch (err) {
      if (reqSeq !== fetchSeq || String(getUser?.()?.id || '') !== targetUid) return;
      state.models = [];
      showToast(err.message || 'Không thể tải danh sách mô hình.', 'error');
    }

    const allowed = getAllowedGrades();
    // Defense-in-depth client-side filter: never retain disallowed grades in memory for non-admin
    if (!isAdmin()) {
      state.models = state.models.filter(
        (m) => m && m.visible !== false && allowed.includes(String(m.grade))
      );
    }

    if (!isAdmin() && allowed.length > 0 && !allowed.includes(state.grade)) {
      state.grade = allowed[0];
      onRouteChange?.(`/mo-hinh/toan-${state.grade}`, { replace: true });
    } else if (autoPickGrade && !state.hasInitializedGrade && allowed.length > 0) {
      state.hasInitializedGrade = true;
      const visibleModels = state.models.filter((m) => m.visible !== false);
      const currentHas = visibleModels.some((m) => String(m.grade) === state.grade);
      if (!currentHas) {
        const firstWithModel = [...allowed].reverse().find((g) => visibleModels.some((m) => String(m.grade) === g));
        if (firstWithModel) state.grade = firstWithModel;
      }
    }
    render();
  }

  function countModelsForGrade(grade, onlyVisible) {
    return state.models.filter((m) => String(m.grade) === String(grade) && (!onlyVisible || m.visible !== false)).length;
  }

  function getModelsForLesson(lessonId, onlyVisible) {
    return state.models.filter((m) => m.lessonId === lessonId && (!onlyVisible || m.visible !== false));
  }

  function render() {
    const admin = isAdmin();
    if (!admin) state.mode = 'showcase';
    const inManage = admin && state.mode === 'manage';
    const missingThumbs = admin ? state.models.filter((m) => !m.thumbnail) : [];
    const allowedGrades = getAllowedGrades();
    if (allowedGrades.length > 0 && !allowedGrades.includes(state.grade)) {
      state.grade = allowedGrades[0];
    }

    const restrictedNotice =
      !admin && state.visibilityMode === 'admin_only'
        ? `<div class="card lab-empty-state"><p>Thư viện mô hình hiện đang ở chế độ <strong>Chỉ mình tôi</strong> (chỉ dành cho Giáo viên).</p></div>`
        : !admin && state.visibilityMode === 'own_grade' && allowedGrades.length === 0
          ? `<div class="card lab-empty-state"><p>Tài khoản của bạn chưa được xếp lớp nên chưa xác định được khối lớp để xem mô hình.</p></div>`
          : '';

    rootEl.innerHTML = `
      <div class="lab-shell">
        <div class="lab-topbar">
          <div class="lab-grade-tabs" role="tablist">
            ${allowedGrades
              .map((g) => {
                const cnt = countModelsForGrade(g, !inManage);
                return `
                  <button class="lab-grade-btn ${state.grade === g ? 'active' : ''}" data-lab-grade="${g}">
                    <span>Toán ${g}</span>
                    <span class="lab-grade-count">${cnt}</span>
                  </button>
                `;
              })
              .join('')}
          </div>

          <div class="lab-topbar-right">
            ${
              inManage
                ? `
                  <input
                    id="labSearchInput"
                    class="input-control input-compact"
                    style="width:210px;"
                    type="text"
                    placeholder="Tìm tên chương, bài học..."
                    value="${escapeAttr(state.search)}"
                  />
                  ${
                    state.models.length > 0
                      ? `<button class="btn btn-secondary btn-sm" id="btnBatchCaptureThumbs" title="Tự động chụp ảnh xem trước 720×450 WebP siêu nhẹ cho mô hình">
                          ${
                            missingThumbs.length > 0
                              ? `Chụp ảnh tự động (${missingThumbs.length})`
                              : `Chụp lại ảnh xem trước`
                          }
                        </button>`
                      : ''
                  }
                  <button class="btn btn-secondary btn-sm" id="btnSwitchShowcase">
                    ← Xem thư viện
                  </button>
                `
                : admin
                  ? `
                    <button class="btn btn-primary btn-sm" id="btnSwitchManage">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1">
                        <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                      </svg>
                      Quản lý mô hình
                    </button>
                  `
                  : ''
            }
          </div>
        </div>

        ${
          inManage
            ? `
              <div class="card lab-visibility-card">
                <div class="lab-visibility-title">Chế độ hiển thị</div>
                <div class="lab-visibility-options" role="radiogroup" aria-label="Chế độ hiển thị">
                  ${VISIBILITY_OPTIONS.map((opt) => {
                    const checked = state.visibilityMode === opt.value;
                    return `
                      <button
                        type="button"
                        role="radio"
                        aria-checked="${checked}"
                        class="lab-vis-option ${checked ? 'active' : ''}"
                        data-vis-mode="${opt.value}"
                      >
                        <span class="lab-vis-radio" aria-hidden="true"></span>
                        <span class="lab-vis-label">${escapeHtml(opt.label)}</span>
                      </button>
                    `;
                  }).join('')}
                </div>
              </div>
            `
            : ''
        }

        ${
          !inManage && admin && missingThumbs.length > 0
            ? `
              <div class="lab-autocap-banner">
                <div class="lab-autocap-text">
                  <strong>Có ${missingThumbs.length} mô hình chưa có ảnh xem trước tĩnh.</strong>
                  <span>Chụp tự động (720×450 WebP ~30 KB/ảnh) và lưu lên Supabase để trang mở tức thì &amp; cuộn siêu mượt.</span>
                </div>
                <button type="button" class="btn btn-primary btn-sm" id="btnAutoCaptureMissing">
                  Tự động chụp &amp; lưu ngay
                </button>
              </div>
            `
            : ''
        }

        <div id="labBody">
          ${restrictedNotice || (inManage ? renderManageView() : renderShowcaseView())}
        </div>
      </div>
    `;

    bindEvents(inManage);
    populateLivePreviewIframes();
  }

  // =========================================================
  // BATCH AUTO-CAPTURE THUMBNAILS (720x450 WEBP -> SUPABASE)
  // =========================================================
  async function runBatchAutoCapture(targetModels) {
    if (!targetModels || targetModels.length === 0) {
      showToast('Tất cả mô hình đều đã có ảnh xem trước.', 'info');
      return;
    }

    let aborted = false;
    let successCount = 0;
    let totalBytes = 0;

    openModal({
      title: 'Tự động chụp ảnh xem trước (720×450 WebP)',
      dismissible: false,
      bodyHtml: `
        <div class="autocap-progress-box">
          <div class="autocap-status-row">
            <strong id="acStatusTitle">Đang chuẩn bị...</strong>
            <span id="acStatusCount" class="badge badge-p1">0 / ${targetModels.length}</span>
          </div>
          <div class="storage-bar-track" style="margin:10px 0 14px;">
            <div class="storage-bar-fill is-ok" id="acProgressBar" style="width:2%;"></div>
          </div>
          <div class="autocap-preview-stage" id="acPreviewStage">
            <span style="color:var(--text-muted); font-size:0.84rem;">Đang dựng mô hình ở độ phân giải chuẩn 1280×800 rồi nén thành ảnh 720×450...</span>
          </div>
          <div id="acLastMeta" style="margin-top:8px; font-size:0.78rem; color:var(--text-muted); text-align:center;"></div>
        </div>
      `,
      footerHtml: `<button type="button" class="btn btn-secondary" id="btnAbortCapture">Dừng lại</button>`,
      onMount: async (m) => {
        const titleEl = m.querySelector('#acStatusTitle');
        const countEl = m.querySelector('#acStatusCount');
        const barEl = m.querySelector('#acProgressBar');
        const stageEl = m.querySelector('#acPreviewStage');
        const metaEl = m.querySelector('#acLastMeta');
        const abortBtn = m.querySelector('#btnAbortCapture');

        abortBtn.addEventListener('click', () => {
          aborted = true;
          abortBtn.disabled = true;
          abortBtn.textContent = 'Đang dừng...';
        });

        for (let i = 0; i < targetModels.length; i++) {
          if (aborted) break;
          const mdl = targetModels[i];
          titleEl.textContent = `Đang chụp: ${mdl.name}`;
          countEl.textContent = `${i + 1} / ${targetModels.length}`;
          barEl.style.width = `${Math.max(4, Math.round((i / targetModels.length) * 100))}%`;

          try {
            const dataUrl = await captureModelThumbnail(mdl.id, { width: 720, height: 450 });
            const kb = Math.round((dataUrl.length * 0.75) / 1024);
            totalBytes += dataUrl.length * 0.75;
            stageEl.innerHTML = `<img src="${escapeAttr(dataUrl)}" alt="${escapeAttr(mdl.name)}" />`;
            metaEl.textContent = `Đã lưu ảnh 720×450 (~${kb} KB) cho "${mdl.name}"`;
            await api.updateModel(mdl.id, { thumbnail: dataUrl });
            successCount++;
          } catch (err) {
            metaEl.textContent = `Bỏ qua "${mdl.name}": ${err.message}`;
          }
          barEl.style.width = `${Math.round(((i + 1) / targetModels.length) * 100)}%`;
        }

        closeModal();
        if (successCount > 0) {
          const avgKb = Math.round(totalBytes / successCount / 1024);
          showToast(
            `Đã chụp & lưu ảnh xem trước cho ${successCount}/${targetModels.length} mô hình (~${avgKb} KB/ảnh)!`,
            'success'
          );
        } else if (!aborted) {
          showToast('Không chụp được ảnh nào. Thầy thử lại sau nhé.', 'error');
        }
        await refresh(false);
      },
    });
  }

  // =========================================================
  // VIEW A: SHOWCASE (TRÌNH BÀY — HỌC SINH & MẶC ĐỊNH CỦA GV)
  // =========================================================
  function renderShowcaseView() {
    const curriculum = MATH_CURRICULUM[state.grade];
    if (!curriculum) return '';

    // Filter ONLY chapters & lessons that have at least 1 visible model!
    const visibleChapters = curriculum.chapters
      .map((ch) => {
        const lessonsWithModels = ch.lessons
          .map((ls) => ({ lesson: ls, models: getModelsForLesson(ls.id, true) }))
          .filter((entry) => entry.models.length > 0);
        return { chapter: ch, lessons: lessonsWithModels };
      })
      .filter((entry) => entry.lessons.length > 0);

    if (visibleChapters.length === 0) {
      return `
        <div class="card lab-empty-state">
          <div class="lab-empty-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <polygon points="12 2 2 7 12 12 22 7 12 2"/>
              <polyline points="2 17 12 22 22 17"/>
              <polyline points="2 12 12 17 22 12"/>
            </svg>
          </div>
          <h3>Chưa có mô hình nào cho ${escapeHtml(curriculum.label)}</h3>
          <p>${
            isAdmin()
              ? 'Nhấn nút <strong>"Quản lý mô hình"</strong> ở góc trên bên phải để tải lên file mô hình <code>.html</code> theo từng bài học.'
              : 'Giáo viên sẽ cập nhật các mô hình tương tác cho khối này trong thời gian tới.'
          }</p>
        </div>
      `;
    }

    return visibleChapters
      .map(
        ({ chapter, lessons }) => `
      <section class="lab-chapter-showcase">
        <div class="lab-chapter-heading">
          <h2>${escapeHtml(chapter.title)}</h2>
        </div>

        ${lessons
          .map(
            ({ lesson, models }) => `
          <div class="lab-lesson-showcase">
            <div class="lab-lesson-title-bar">
              <span class="lab-lesson-code">${escapeHtml(lesson.code)}</span>
              <h3>${escapeHtml(lesson.title)}</h3>
            </div>
            <div class="lab-preview-grid">
              ${models
                .map(
                  (m) => `
                <a
                  class="model-preview-card"
                  href="/model/${encodeURIComponent(m.id)}"
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Mở toàn màn hình trong tab mới"
                >
                  <div class="model-thumb-frame">
                    ${
                      m.thumbnail
                        ? `<img src="${escapeAttr(m.thumbnail)}" alt="${escapeAttr(m.name)}" class="model-thumb-img" loading="lazy" decoding="async" />`
                        : `
                          <div class="model-thumb-skeleton">
                            <span>Đang tải xem trước...</span>
                          </div>
                          <iframe
                            class="model-thumb-iframe"
                            data-live-preview-id="${escapeAttr(m.id)}"
                            sandbox="allow-scripts"
                            tabindex="-1"
                            aria-hidden="true"
                          ></iframe>
                        `
                    }
                    <div class="model-thumb-overlay">
                      <span class="model-open-pill">
                        Mở toàn màn hình
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                          <polyline points="15 3 21 3 21 9"/>
                          <line x1="10" y1="14" x2="21" y2="3"/>
                        </svg>
                      </span>
                    </div>
                  </div>
                  <div class="model-card-body">
                    <div class="model-card-name">${escapeHtml(m.name)}</div>
                  </div>
                </a>
              `
                )
                .join('')}
            </div>
          </div>
        `
          )
          .join('')}
      </section>
    `
      )
      .join('');
  }

  // =========================================================
  // VIEW B: MANAGE (CHỈNH SỬA — CHỈ GIÁO VIÊN)
  // =========================================================
  function renderManageView() {
    const curriculum = MATH_CURRICULUM[state.grade];
    if (!curriculum) return '';
    const q = state.search.trim().toLowerCase();

    const chs = curriculum.chapters
      .map((ch) => {
        const matchedLessons = q
          ? ch.lessons.filter(
              (ls) =>
                `${ls.code} ${ls.title}`.toLowerCase().includes(q) ||
                ch.title.toLowerCase().includes(q) ||
                getModelsForLesson(ls.id, false).some((m) => m.name.toLowerCase().includes(q))
            )
          : ch.lessons;
        return { chapter: ch, lessons: matchedLessons };
      })
      .filter((x) => x.lessons.length > 0);

    if (chs.length === 0) {
      return `<div class="card lab-empty-state"><p>Không tìm thấy bài học nào khớp với "${escapeHtml(state.search)}".</p></div>`;
    }

    return chs
      .map(({ chapter, lessons }) => {
        const chapterModels = chapter.lessons.flatMap((ls) => getModelsForLesson(ls.id, false));
        const visibleCnt = chapterModels.filter((m) => m.visible !== false).length;
        const isCollapsed = !q && state.collapsedChapters.has(chapter.id);

        return `
          <div class="card lab-chapter-acc ${isCollapsed ? 'is-collapsed' : ''}">
            <button type="button" class="lab-chapter-acc-head" data-toggle-ch="${chapter.id}">
              <div class="lab-chapter-acc-title">
                <svg class="acc-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
                <span>${escapeHtml(chapter.title)}</span>
              </div>
              <div style="display:flex; gap:6px; align-items:center;">
                ${
                  chapterModels.length > 0
                    ? `<span class="badge badge-p3">${visibleCnt}/${chapterModels.length} đang hiện</span>`
                    : `<span class="badge badge-neutral">0 mô hình</span>`
                }
              </div>
            </button>

            <div class="lab-chapter-acc-body">
              ${lessons
                .map((ls) => {
                  const lsModels = getModelsForLesson(ls.id, false);
                  return `
                    <div class="lab-lesson-row" data-drop-lesson="${ls.id}" data-drop-chapter="${chapter.id}">
                      <div class="lab-lesson-row-head">
                        <div class="lab-lesson-row-info">
                          <span class="lab-lesson-code">${escapeHtml(ls.code)}</span>
                          <span class="lab-lesson-name">${escapeHtml(ls.title)}</span>
                          ${
                            lsModels.length > 0
                              ? `<span class="badge badge-p1">${lsModels.length} mô hình</span>`
                              : ''
                          }
                        </div>
                        <button
                          type="button"
                          class="btn btn-secondary btn-sm"
                          data-upload-lesson="${ls.id}"
                          data-upload-chapter="${chapter.id}"
                        >
                          + Tải lên .html
                        </button>
                      </div>

                      ${
                        lsModels.length > 0
                          ? `
                            <div class="lab-manage-model-list">
                              ${lsModels
                                .map((m) => {
                                  const isVis = m.visible !== false;
                                  return `
                                    <div class="lab-manage-model-item ${isVis ? '' : 'is-hidden-model'}">
                                      <div class="lab-mini-thumb">
                                        ${
                                          m.thumbnail
                                            ? `<img src="${escapeAttr(m.thumbnail)}" alt="${escapeAttr(m.name)}" loading="lazy" decoding="async" />`
                                            : `<div class="lab-mini-icon-box" aria-hidden="true">
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">
                                                  <polygon points="12 2 2 7 12 12 22 7 12 2"/>
                                                  <polyline points="2 17 12 22 22 17"/>
                                                  <polyline points="2 12 12 17 22 12"/>
                                                </svg>
                                              </div>`
                                        }
                                      </div>
                                      <div class="lab-manage-model-info">
                                        <div class="lab-manage-model-name">
                                          ${escapeHtml(m.name)}
                                          ${
                                            !isVis
                                              ? `<span class="badge badge-neutral">Đang ẩn</span>`
                                              : `<span class="badge badge-success">Đang hiện</span>`
                                          }
                                        </div>
                                        <div class="lab-manage-model-meta">${escapeHtml(m.fileName)} • ${escapeHtml(m.addedAt)}</div>
                                      </div>
                                      <div class="lab-manage-model-actions">
                                        <label class="switch" title="${isVis ? 'Đang hiện — nhấn để ẩn' : 'Đang ẩn — nhấn để hiện'}">
                                          <input type="checkbox" data-toggle-vis="${m.id}" ${isVis ? 'checked' : ''} />
                                          <span class="slider"></span>
                                        </label>
                                        <a class="btn btn-secondary btn-sm" href="/model/${encodeURIComponent(m.id)}" target="_blank" rel="noopener noreferrer">
                                          Mở ↗
                                        </a>
                                        <button type="button" class="btn btn-secondary btn-sm" data-edit-code="${m.id}">Sửa mã HTML</button>
                                        <button type="button" class="btn btn-secondary btn-sm" data-edit-model="${m.id}">Sửa</button>
                                        <button type="button" class="btn btn-danger-outline btn-sm" data-del-model="${m.id}">Xóa</button>
                                      </div>
                                    </div>
                                  `;
                                })
                                .join('')}
                            </div>
                          `
                          : ''
                      }
                    </div>
                  `;
                })
                .join('')}
            </div>
          </div>
        `;
      })
      .join('');
  }

  /**
   * High-performance Lazy + Staggered Queue loader for live HTML/WebGL previews:
   * - Only loads cards near the viewport (IntersectionObserver)
   * - Runs at most 2 previews concurrently so opening many 3D models never freezes the browser
   * - Uses /model/<id>?preview=1 which renders a crisp initial frame and automatically freezes
   *   WebGL requestAnimationFrame/intervals so GPU/CPU drops to 0% while scrolling!
   */
  function populateLivePreviewIframes() {
    if (previewObserver) {
      previewObserver.disconnect();
      previewObserver = null;
    }
    const mySession = ++previewSessionId;
    const iframes = Array.from(rootEl.querySelectorAll('iframe[data-live-preview-id]'));
    if (iframes.length === 0) return;

    const MAX_CONCURRENT = 2;
    const queue = [];
    let activeCount = 0;

    function pumpQueue() {
      if (mySession !== previewSessionId) return;
      while (activeCount < MAX_CONCURRENT && queue.length > 0) {
        const iframe = queue.shift();
        if (!iframe || !document.body.contains(iframe) || iframe.dataset.previewLoaded === '1') {
          continue;
        }
        iframe.dataset.previewLoaded = '1';
        activeCount++;

        let settled = false;
        const finishSlot = () => {
          if (settled) return;
          settled = true;
          activeCount = Math.max(0, activeCount - 1);
          if (mySession === previewSessionId && document.body.contains(iframe)) {
            iframe.classList.add('is-ready');
            iframe.closest('.model-thumb-frame')?.querySelector('.model-thumb-skeleton')?.classList.add('hidden');
          }
          pumpQueue();
        };

        iframe.addEventListener(
          'load',
          () => {
            // Brief settle pause so WebGL paints its initial frame before starting next slot
            setTimeout(finishSlot, 280);
          },
          { once: true }
        );
        // Safety timeout so a slow CDN inside one model never blocks the rest of the queue
        setTimeout(finishSlot, 2400);

        const id = iframe.dataset.livePreviewId;
        iframe.src = `/model/${encodeURIComponent(id)}?preview=1&r=${state.renderRev}`;
      }
    }

    function enqueue(iframe) {
      if (iframe.dataset.previewQueued === '1' || iframe.dataset.previewLoaded === '1') return;
      iframe.dataset.previewQueued = '1';
      queue.push(iframe);
      pumpQueue();
    }

    if (typeof window.IntersectionObserver === 'function') {
      previewObserver = new IntersectionObserver(
        (entries) => {
          if (mySession !== previewSessionId) return;
          for (const entry of entries) {
            if (entry.isIntersecting) {
              const iframe = entry.target;
              previewObserver?.unobserve(iframe);
              enqueue(iframe);
            }
          }
        },
        { rootMargin: '180px 0px' }
      );
      iframes.forEach((iframe) => previewObserver.observe(iframe));
    } else {
      iframes.forEach(enqueue);
    }
  }

  // =========================================================
  // UPLOAD / EDIT MODEL MODAL
  // =========================================================
  function openModelModal({ existing = null, grade = state.grade, chapterId = '', lessonId = '' } = {}) {
    const initGrade = existing?.grade || grade;
    const initLessonId = existing?.lessonId || lessonId;
    const initChapterId = existing?.chapterId || chapterId;
    let selectedHtmlText = '';
    let selectedFileName = existing?.fileName || '';
    let selectedThumbnail = existing?.thumbnail || '';

    const buildLessonOptions = (g, currentLessonId) => {
      const cur = MATH_CURRICULUM[g];
      if (!cur) return '';
      return cur.chapters
        .map(
          (ch) => `
          <optgroup label="${escapeAttr(ch.title)}">
            ${ch.lessons
              .map(
                (ls) =>
                  `<option value="${ls.id}" data-ch="${ch.id}" ${ls.id === currentLessonId ? 'selected' : ''}>${escapeHtml(`${ls.code}: ${ls.title}`)}</option>`
              )
              .join('')}
          </optgroup>
        `
        )
        .join('');
    };

    openModal({
      title: existing ? 'Chỉnh sửa mô hình tương tác' : 'Tải lên mô hình tương tác (.html)',
      wide: true,
      bodyHtml: `
        <div class="form-row-2">
          <div class="form-group">
            <label>Khối lớp</label>
            <select id="mdlGrade" class="input-control">
              <option value="10" ${initGrade === '10' ? 'selected' : ''}>Toán 10</option>
              <option value="11" ${initGrade === '11' ? 'selected' : ''}>Toán 11</option>
              <option value="12" ${initGrade === '12' ? 'selected' : ''}>Toán 12</option>
            </select>
          </div>
          <div class="form-group">
            <label>Thuộc bài học *</label>
            <select id="mdlLesson" class="input-control">
              ${buildLessonOptions(initGrade, initLessonId)}
            </select>
          </div>
        </div>

        <div class="form-group">
          <label>Tên hiển thị của mô hình *</label>
          <input id="mdlName" class="input-control" placeholder="VD: Mô phỏng 3D hình chóp S.ABCD" value="${escapeAttr(existing?.name || '')}" />
        </div>

        <div class="form-row-2">
          <div class="form-group">
            <label>${existing ? 'Thay file mô hình .html (tùy chọn)' : 'Chọn file mô hình (.html) *'}</label>
            <div class="dropzone" id="mdlHtmlDrop" style="padding:14px;">
              <input type="file" id="mdlHtmlInput" accept=".html,.htm,text/html" hidden />
              <div class="dropzone-title" id="mdlHtmlLabel" style="font-size:0.84rem;">
                ${selectedFileName ? `Đã chọn: ${escapeHtml(selectedFileName)}` : 'Kéo thả hoặc nhấn chọn file .html'}
              </div>
            </div>
          </div>

          <div class="form-group">
            <label>Ảnh xem trước (tùy chọn — bỏ trống tự lấy ảnh từ HTML)</label>
            <div class="dropzone" id="mdlThumbDrop" style="padding:14px;">
              <input type="file" id="mdlThumbInput" accept="image/*" hidden />
              <div id="mdlThumbPreviewWrap">
                ${
                  selectedThumbnail
                    ? `<img src="${escapeAttr(selectedThumbnail)}" style="max-height:76px; border-radius:8px; display:block; margin:0 auto;" />`
                    : `<div class="dropzone-title" style="font-size:0.84rem;">Nhấn chọn ảnh .png / .jpg (tùy chọn)</div>`
                }
              </div>
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:6px;">
              ${
                existing
                  ? `<button type="button" class="btn btn-secondary btn-sm" id="btnAutoCapSingle">Tự chụp ảnh từ HTML</button>`
                  : ''
              }
              ${
                selectedThumbnail
                  ? `<button type="button" class="btn btn-ghost btn-sm" id="btnClearThumb">Xóa ảnh đại diện</button>`
                  : ''
              }
            </div>
          </div>
        </div>

        <div class="toggle-row" style="margin-bottom:0;">
          <div>
            <div class="toggle-label">Hiển thị mô hình</div>
            <div class="toggle-sub">Bật để hiển thị ngay trong danh sách; tắt để tạm ẩn</div>
          </div>
          <label class="switch">
            <input type="checkbox" id="mdlVisible" ${existing ? (existing.visible !== false ? 'checked' : '') : 'checked'} />
            <span class="slider"></span>
          </label>
        </div>
      `,
      footerHtml: `
        <button class="btn btn-secondary" id="mCancelMdl">Hủy</button>
        <button class="btn btn-primary" id="mSaveMdl">${existing ? 'Lưu thay đổi' : 'Tải lên mô hình'}</button>
      `,
      onMount: (m) => {
        const gradeSel = m.querySelector('#mdlGrade');
        const lessonSel = m.querySelector('#mdlLesson');
        const nameInp = m.querySelector('#mdlName');
        const htmlDrop = m.querySelector('#mdlHtmlDrop');
        const htmlInp = m.querySelector('#mdlHtmlInput');
        const htmlLbl = m.querySelector('#mdlHtmlLabel');
        const thumbDrop = m.querySelector('#mdlThumbDrop');
        const thumbInp = m.querySelector('#mdlThumbInput');
        const thumbWrap = m.querySelector('#mdlThumbPreviewWrap');

        gradeSel.addEventListener('change', () => {
          lessonSel.innerHTML = buildLessonOptions(gradeSel.value, '');
        });

        async function loadHtmlFile(file) {
          if (!/\.html?$/i.test(file.name)) {
            showToast('Vui lòng chọn file có đuôi .html hoặc .htm.', 'error');
            return;
          }
          selectedHtmlText = await file.text();
          selectedFileName = file.name;
          htmlLbl.textContent = `Đã chọn: ${file.name}`;
          if (!nameInp.value.trim()) {
            const tm = selectedHtmlText.match(/<title[^>]*>([^<]+)<\/title>/i);
            nameInp.value = tm ? tm[1].trim() : file.name.replace(/\.html?$/i, '');
          }
        }

        htmlDrop.addEventListener('click', () => htmlInp.click());
        htmlDrop.addEventListener('dragover', (e) => {
          e.preventDefault();
          htmlDrop.classList.add('drag-over');
        });
        htmlDrop.addEventListener('dragleave', () => htmlDrop.classList.remove('drag-over'));
        htmlDrop.addEventListener('drop', (e) => {
          e.preventDefault();
          htmlDrop.classList.remove('drag-over');
          const f = e.dataTransfer?.files?.[0];
          if (f) loadHtmlFile(f);
        });
        htmlInp.addEventListener('change', () => {
          const f = htmlInp.files?.[0];
          if (f) loadHtmlFile(f);
          htmlInp.value = '';
        });

        async function loadThumbFile(file) {
          if (!file.type.startsWith('image/')) {
            showToast('Vui lòng chọn file ảnh (.png, .jpg, .webp).', 'error');
            return;
          }
          try {
            selectedThumbnail = await compressImageToDataUrl(file);
            thumbWrap.innerHTML = `<img src="${escapeAttr(selectedThumbnail)}" style="max-height:76px; border-radius:8px; display:block; margin:0 auto;" />`;
          } catch (err) {
            showToast(err.message, 'error');
          }
        }

        thumbDrop.addEventListener('click', () => thumbInp.click());
        thumbInp.addEventListener('change', () => {
          const f = thumbInp.files?.[0];
          if (f) loadThumbFile(f);
          thumbInp.value = '';
        });

        m.querySelector('#btnAutoCapSingle')?.addEventListener('click', async (e) => {
          if (!existing) return;
          const btn = e.currentTarget;
          btn.disabled = true;
          btn.textContent = 'Đang chụp...';
          try {
            selectedThumbnail = await captureModelThumbnail(existing.id, { width: 720, height: 450 });
            thumbWrap.innerHTML = `<img src="${escapeAttr(selectedThumbnail)}" style="max-height:76px; border-radius:8px; display:block; margin:0 auto;" />`;
            const kb = Math.round((selectedThumbnail.length * 0.75) / 1024);
            showToast(`Đã chụp ảnh 720×450 (~${kb} KB)! Nhấn "Lưu thay đổi" để lưu.`, 'success');
          } catch (err) {
            showToast(err.message, 'error');
          } finally {
            btn.disabled = false;
            btn.textContent = 'Tự chụp ảnh từ HTML';
          }
        });

        m.querySelector('#btnClearThumb')?.addEventListener('click', () => {
          selectedThumbnail = '';
          thumbWrap.innerHTML = `<div class="dropzone-title" style="font-size:0.84rem;">Nhấn chọn ảnh .png / .jpg (tùy chọn)</div>`;
        });

        m.querySelector('#mCancelMdl').addEventListener('click', closeModal);
        const saveMdlBtn = m.querySelector('#mSaveMdl');
        saveMdlBtn.addEventListener('click', async () => {
          const name = nameInp.value.trim();
          if (!name) {
            showToast('Vui lòng nhập tên hiển thị của mô hình.', 'error');
            return;
          }
          if (!existing && !selectedHtmlText.trim()) {
            showToast('Vui lòng chọn file mô hình (.html).', 'error');
            return;
          }
          const chosenLessonId = lessonSel.value;
          const info = findLessonInfo(chosenLessonId);
          const payload = {
            name,
            grade: info?.grade || gradeSel.value,
            chapterId: info?.chapter?.id || initChapterId,
            lessonId: chosenLessonId,
            visible: m.querySelector('#mdlVisible').checked,
            thumbnail: selectedThumbnail,
          };
          if (selectedHtmlText.trim()) {
            payload.html = selectedHtmlText;
            payload.fileName = selectedFileName || 'model.html';
          }
          saveMdlBtn.disabled = true;
          saveMdlBtn.textContent = 'Đang lưu...';
          try {
            let savedId = existing?.id || '';
            const shouldAutoCap = !selectedThumbnail && (!existing || Boolean(selectedHtmlText.trim()));
            if (existing) {
              await api.updateModel(existing.id, payload);
            } else {
              const res = await api.uploadModel(payload);
              savedId = res?.model?.id || '';
            }
            if (shouldAutoCap && savedId) {
              saveMdlBtn.textContent = 'Đang tự chụp ảnh xem trước...';
              try {
                const autoThumb = await captureModelThumbnail(savedId, { width: 720, height: 450 });
                await api.updateModel(savedId, { thumbnail: autoThumb });
              } catch {
                // fallback silently to live preview if capture fails
              }
            }
            showToast(existing ? 'Đã cập nhật mô hình thành công!' : `Đã tải lên & tạo ảnh xem trước cho "${name}"!`, 'success');
            closeModal();
            state.grade = payload.grade;
            await refresh(false);
          } catch (err) {
            showToast(err.message, 'error');
            saveMdlBtn.disabled = false;
            saveMdlBtn.textContent = existing ? 'Lưu thay đổi' : 'Tải lên mô hình';
          }
        });
      },
    });
  }

  // =========================================================
  // DIRECT IN-WEB HTML CODE EDITOR MODAL (LIVE SPLIT PREVIEW)
  // =========================================================
  async function openHtmlCodeEditorModal(modelSummary) {
    let model = modelSummary;
    if (!model.html) {
      try {
        const res = await api.getModel(modelSummary.id);
        if (res?.model) model = res.model;
      } catch (err) {
        showToast(err.message || 'Không thể tải mã nguồn HTML của mô hình.', 'error');
        return;
      }
    }
    const initialHtml = model.html || '';

    openModal({
      title: `Chỉnh sửa mã HTML — ${model.name}`,
      xl: true,
      bodyHtml: `
        <div class="html-editor-toolbar">
          <div class="html-editor-meta">
            <span class="badge badge-p1">${escapeHtml(model.fileName || 'model.html')}</span>
            <span id="htmlCodeStats" style="font-size:0.78rem; color:var(--text-muted);"></span>
          </div>
          <div class="html-editor-tools">
            <input id="htmlCodeFind" type="search" class="input-control input-compact" placeholder="Tìm trong mã..." style="width:180px;" />
            <button type="button" class="btn btn-secondary btn-sm" id="btnHtmlFindNext">Tìm tiếp</button>
            <button type="button" class="btn btn-secondary btn-sm" id="btnHtmlRunPreview">Chạy xem trước</button>
            <button type="button" class="btn btn-ghost btn-sm" id="btnHtmlDownload">Tải file .html</button>
          </div>
        </div>
        <div class="html-editor-split">
          <div class="html-editor-pane">
            <div class="html-pane-label">Mã nguồn HTML / CSS / JavaScript</div>
            <textarea id="htmlCodeArea" class="html-code-textarea" spellcheck="false"></textarea>
          </div>
          <div class="html-editor-pane">
            <div class="html-pane-label">Xem trước trực tiếp</div>
            <div class="html-preview-box">
              <iframe id="htmlLivePreviewFrame" class="html-live-iframe" title="Xem trước mô hình HTML"></iframe>
            </div>
          </div>
        </div>
      `,
      footerHtml: `
        <button class="btn btn-secondary" id="mCancelHtmlCode">Hủy</button>
        <button class="btn btn-primary" id="mSaveHtmlCode">Lưu mã HTML</button>
      `,
      onMount: (m) => {
        const codeEl = m.querySelector('#htmlCodeArea');
        const statsEl = m.querySelector('#htmlCodeStats');
        const frameEl = m.querySelector('#htmlLivePreviewFrame');
        const findInp = m.querySelector('#htmlCodeFind');
        const saveBtn = m.querySelector('#mSaveHtmlCode');

        codeEl.value = initialHtml;
        frameEl.srcdoc = initialHtml;

        function updateStats() {
          const val = codeEl.value;
          const lines = val ? val.split('\n').length : 0;
          const kb = (new Blob([val]).size / 1024).toFixed(1).replace('.', ',');
          statsEl.textContent = `${lines} dòng • ${kb} KB`;
        }
        updateStats();

        function runPreview() {
          frameEl.srcdoc = codeEl.value;
        }

        // Tab key inserts 2 spaces instead of leaving editor; Ctrl+Enter refreshes preview
        codeEl.addEventListener('keydown', (e) => {
          if (e.key === 'Tab') {
            e.preventDefault();
            const start = codeEl.selectionStart;
            const end = codeEl.selectionEnd;
            codeEl.value = codeEl.value.slice(0, start) + '  ' + codeEl.value.slice(end);
            codeEl.selectionStart = codeEl.selectionEnd = start + 2;
            updateStats();
          } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            runPreview();
            showToast('Đã cập nhật khung xem trước.', 'info');
          }
        });

        codeEl.addEventListener('input', updateStats);

        // Quick search inside textarea
        let lastFindPos = 0;
        const doFindNext = () => {
          const q = findInp.value;
          if (!q) return;
          const hay = codeEl.value.toLowerCase();
          const needle = q.toLowerCase();
          let idx = hay.indexOf(needle, lastFindPos);
          if (idx === -1 && lastFindPos > 0) {
            idx = hay.indexOf(needle, 0);
          }
          if (idx === -1) {
            showToast(`Không tìm thấy "${q}".`, 'error');
            return;
          }
          codeEl.focus();
          codeEl.setSelectionRange(idx, idx + q.length);
          lastFindPos = idx + q.length;
        };
        m.querySelector('#btnHtmlFindNext')?.addEventListener('click', doFindNext);
        findInp?.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            doFindNext();
          }
        });
        findInp?.addEventListener('input', () => {
          lastFindPos = 0;
        });

        m.querySelector('#btnHtmlRunPreview')?.addEventListener('click', () => {
          runPreview();
          showToast('Đã cập nhật khung xem trước!', 'info');
        });

        m.querySelector('#btnHtmlDownload')?.addEventListener('click', () => {
          const blob = new Blob([codeEl.value], { type: 'text/html;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = model.fileName || 'model.html';
          a.click();
          URL.revokeObjectURL(url);
        });

        m.querySelector('#mCancelHtmlCode').addEventListener('click', closeModal);
        saveBtn.addEventListener('click', async () => {
          const newHtml = codeEl.value;
          if (!newHtml.trim()) {
            showToast('Mã HTML không được để trống.', 'error');
            return;
          }
          saveBtn.disabled = true;
          saveBtn.textContent = 'Đang lưu...';
          try {
            await api.updateModel(model.id, {
              html: newHtml,
              fileName: model.fileName || 'model.html',
            });
            saveBtn.textContent = 'Đang cập nhật ảnh xem trước...';
            try {
              const autoThumb = await captureModelThumbnail(model.id, { width: 720, height: 450 });
              await api.updateModel(model.id, { thumbnail: autoThumb });
            } catch {
              // keep existing thumbnail if capture fails
            }
            showToast(`Đã lưu mã HTML & cập nhật ảnh xem trước cho "${model.name}"!`, 'success');
            closeModal();
            await refresh(false);
          } catch (err) {
            showToast(err.message, 'error');
            saveBtn.disabled = false;
            saveBtn.textContent = 'Lưu mã HTML';
          }
        });
      },
    });
  }

  // =========================================================
  // EVENTS
  // =========================================================
  function bindEvents(inManage) {
    rootEl.querySelectorAll('[data-lab-grade]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.grade = btn.dataset.labGrade;
        state.hasInitializedGrade = true;
        if (state.mode === 'showcase') {
          onRouteChange?.(`/mo-hinh/toan-${state.grade}`);
        }
        render();
      });
    });

    rootEl.querySelector('#btnSwitchManage')?.addEventListener('click', () => {
      state.mode = 'manage';
      onRouteChange?.('/mo-hinh/quan-ly');
      render();
    });

    rootEl.querySelector('#btnSwitchShowcase')?.addEventListener('click', () => {
      state.mode = 'showcase';
      onRouteChange?.(`/mo-hinh/toan-${state.grade}`);
      render();
    });

    rootEl.querySelector('#btnAutoCaptureMissing')?.addEventListener('click', () => {
      const missing = state.models.filter((m) => !m.thumbnail);
      runBatchAutoCapture(missing);
    });

    rootEl.querySelector('#btnBatchCaptureThumbs')?.addEventListener('click', () => {
      const missing = state.models.filter((m) => !m.thumbnail);
      runBatchAutoCapture(missing.length > 0 ? missing : [...state.models]);
    });

    if (!inManage) return;

    rootEl.querySelectorAll('[data-vis-mode]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const nextMode = btn.dataset.visMode;
        if (!nextMode || nextMode === state.visibilityMode) return;
        const prevMode = state.visibilityMode;
        state.visibilityMode = nextMode;
        render();
        try {
          const res = await api.saveModelsSettings(nextMode);
          state.visibilityMode = res.modelsVisibilityMode || nextMode;
          onVisibilityModeChanged?.(state.visibilityMode);
          const optLabel = VISIBILITY_OPTIONS.find((o) => o.value === state.visibilityMode)?.label || '';
          showToast(`Đã cập nhật Chế độ hiển thị: ${optLabel}`, 'success');
        } catch (err) {
          state.visibilityMode = prevMode;
          render();
          showToast(err.message || 'Không thể lưu Chế độ hiển thị.', 'error');
        }
      });
    });

    rootEl.querySelector('#labSearchInput')?.addEventListener('input', (e) => {
      state.search = e.target.value;
      const pos = e.target.selectionStart;
      render();
      const inp = rootEl.querySelector('#labSearchInput');
      if (inp) {
        inp.focus();
        if (typeof pos === 'number') inp.setSelectionRange(pos, pos);
      }
    });

    rootEl.querySelectorAll('[data-toggle-ch]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const chId = btn.dataset.toggleCh;
        if (state.collapsedChapters.has(chId)) state.collapsedChapters.delete(chId);
        else state.collapsedChapters.add(chId);
        btn.closest('.lab-chapter-acc')?.classList.toggle('is-collapsed', state.collapsedChapters.has(chId));
      });
    });

    rootEl.querySelectorAll('[data-upload-lesson]').forEach((btn) => {
      btn.addEventListener('click', () => {
        openModelModal({
          grade: state.grade,
          chapterId: btn.dataset.uploadChapter,
          lessonId: btn.dataset.uploadLesson,
        });
      });
    });

    // Quick drag-and-drop .html directly onto any lesson row!
    rootEl.querySelectorAll('[data-drop-lesson]').forEach((row) => {
      row.addEventListener('dragover', (e) => {
        e.preventDefault();
        row.classList.add('is-drop-hover');
      });
      row.addEventListener('dragleave', () => row.classList.remove('is-drop-hover'));
      row.addEventListener('drop', async (e) => {
        e.preventDefault();
        row.classList.remove('is-drop-hover');
        const files = Array.from(e.dataTransfer?.files || []).filter((f) => /\.html?$/i.test(f.name));
        if (files.length === 0) return;
        const lessonId = row.dataset.dropLesson;
        const chapterId = row.dataset.dropChapter;
        const createdModels = [];
        for (const f of files) {
          const html = await f.text();
          const tm = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          const name = tm ? tm[1].trim() : f.name.replace(/\.html?$/i, '');
          try {
            const res = await api.uploadModel({
              name,
              fileName: f.name,
              grade: state.grade,
              chapterId,
              lessonId,
              visible: true,
              thumbnail: '',
              html,
            });
            if (res?.model) createdModels.push(res.model);
          } catch (err) {
            showToast(err.message, 'error');
          }
        }
        if (createdModels.length > 0) {
          await refresh(false);
          await runBatchAutoCapture(createdModels);
        }
      });
    });

    // Toggle visible / hidden
    rootEl.querySelectorAll('[data-toggle-vis]').forEach((chk) => {
      chk.addEventListener('change', async () => {
        const id = chk.dataset.toggleVis;
        const nextVis = chk.checked;
        try {
          await api.updateModel(id, { visible: nextVis });
          const target = state.models.find((m) => m.id === id);
          if (target) target.visible = nextVis;
          showToast(nextVis ? 'Đã hiển thị mô hình.' : 'Đã ẩn mô hình.', 'success');
          render();
        } catch (err) {
          chk.checked = !nextVis;
          showToast(err.message, 'error');
        }
      });
    });

    rootEl.querySelectorAll('[data-edit-code]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const m = state.models.find((x) => x.id === btn.dataset.editCode);
        if (m) openHtmlCodeEditorModal(m);
      });
    });

    rootEl.querySelectorAll('[data-edit-model]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const m = state.models.find((x) => x.id === btn.dataset.editModel);
        if (m) openModelModal({ existing: m });
      });
    });

    rootEl.querySelectorAll('[data-del-model]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const m = state.models.find((x) => x.id === btn.dataset.delModel);
        if (!m) return;
        openModal({
          title: 'Xác nhận xóa mô hình',
          bodyHtml: `<p style="margin:0;">Bạn có chắc chắn muốn xóa mô hình <strong>${escapeHtml(m.name)}</strong>?</p>`,
          footerHtml: `
            <button class="btn btn-secondary" id="mCancelDelM">Hủy</button>
            <button class="btn btn-danger-outline" id="mOkDelM">Xóa mô hình</button>
          `,
          onMount: (modalEl) => {
            modalEl.querySelector('#mCancelDelM').addEventListener('click', closeModal);
            modalEl.querySelector('#mOkDelM').addEventListener('click', async () => {
              closeModal();
              try {
                await api.deleteModel(m.id);
                showToast('Đã xóa mô hình.', 'success');
                await refresh(false);
              } catch (err) {
                showToast(err.message, 'error');
              }
            });
          },
        });
      });
    });
  }

  return { init, reset };
}
