import { api } from './api.js?v=20261122h';
import { MATH_CURRICULUM, findLessonInfo } from './curriculum-data.js?v=20261122h';
import { escapeHtml, escapeAttr } from './exam-engine.js?v=20261122h';

/**
 * Resize an uploaded preview image to a crisp lightweight JPEG data URL (max 680px wide)
 * so it loads instantaneously and stays compact in Supabase/local storage.
 */
function compressImageToDataUrl(file, maxWidth = 680) {
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
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => reject(new Error('Không thể đọc file ảnh xem trước.'));
      img.src = String(reader.result || '');
    };
    reader.onerror = () => reject(new Error('Lỗi đọc file ảnh.'));
    reader.readAsDataURL(file);
  });
}

export function createHtmlLabController({ rootEl, uiHelpers, getUser }) {
  const { showToast, openModal, closeModal } = uiHelpers;

  const state = {
    models: [],
    grade: '12', // '10' | '11' | '12'
    mode: 'showcase', // 'showcase' (Trình bày - default) | 'manage' (Chỉnh sửa - admin only)
    search: '',
    collapsedChapters: new Set(),
    hasInitializedGrade: false,
  };

  function isAdmin() {
    return getUser?.()?.role === 'admin';
  }

  async function init() {
    // Default to showcase view whenever entering the tab
    state.mode = 'showcase';
    await refresh(true);
  }

  async function refresh(autoPickGrade = false) {
    try {
      const res = await api.getModels();
      state.models = Array.isArray(res.models) ? res.models : [];
    } catch (err) {
      state.models = [];
      showToast(err.message || 'Không thể tải danh sách mô hình.', 'error');
    }

    if (autoPickGrade && !state.hasInitializedGrade) {
      state.hasInitializedGrade = true;
      const visibleModels = state.models.filter((m) => m.visible !== false);
      const currentHas = visibleModels.some((m) => String(m.grade) === state.grade);
      if (!currentHas) {
        const firstWithModel = ['12', '11', '10'].find((g) => visibleModels.some((m) => String(m.grade) === g));
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

    rootEl.innerHTML = `
      <div class="lab-shell">
        <div class="lab-topbar">
          <div class="lab-grade-tabs" role="tablist">
            ${['10', '11', '12']
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
                    style="width:230px;"
                    type="text"
                    placeholder="Tìm tên chương, bài học..."
                    value="${escapeAttr(state.search)}"
                  />
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

        <div id="labBody">
          ${inManage ? renderManageView() : renderShowcaseView()}
        </div>
      </div>
    `;

    bindEvents(inManage);
    populateLivePreviewIframes();
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
                        ? `<img src="${escapeAttr(m.thumbnail)}" alt="${escapeAttr(m.name)}" class="model-thumb-img" />`
                        : `<iframe class="model-thumb-iframe" data-live-preview-id="${escapeAttr(m.id)}" sandbox="allow-scripts" tabindex="-1" aria-hidden="true"></iframe>`
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
                                            ? `<img src="${escapeAttr(m.thumbnail)}" alt="${escapeAttr(m.name)}" />`
                                            : `<iframe class="model-thumb-iframe mini" data-live-preview-id="${escapeAttr(m.id)}" sandbox="allow-scripts" tabindex="-1"></iframe>`
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
   * Inject srcdoc into live preview iframes (for models without a custom thumbnail image)
   */
  function populateLivePreviewIframes() {
    const byId = new Map(state.models.map((m) => [m.id, m]));
    rootEl.querySelectorAll('iframe[data-live-preview-id]').forEach((iframe) => {
      const m = byId.get(iframe.dataset.livePreviewId);
      if (m && m.html) {
        iframe.srcdoc = m.html;
      }
    });
  }

  // =========================================================
  // UPLOAD / EDIT MODEL MODAL
  // =========================================================
  function openModelModal({ existing = null, grade = state.grade, chapterId = '', lessonId = '' } = {}) {
    const initGrade = existing?.grade || grade;
    const initLessonId = existing?.lessonId || lessonId;
    const initChapterId = existing?.chapterId || chapterId;
    let selectedHtmlText = existing?.html || '';
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
            ${
              selectedThumbnail
                ? `<button type="button" class="btn btn-ghost btn-sm" id="btnClearThumb" style="margin-top:4px;">Bỏ ảnh đại diện (dùng xem trước tự động)</button>`
                : ''
            }
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

        m.querySelector('#btnClearThumb')?.addEventListener('click', () => {
          selectedThumbnail = '';
          thumbWrap.innerHTML = `<div class="dropzone-title" style="font-size:0.84rem;">Nhấn chọn ảnh .png / .jpg (tùy chọn)</div>`;
        });

        m.querySelector('#mCancelMdl').addEventListener('click', closeModal);
        m.querySelector('#mSaveMdl').addEventListener('click', async () => {
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
          try {
            if (existing) {
              await api.updateModel(existing.id, payload);
              showToast('Đã cập nhật mô hình thành công!', 'success');
            } else {
              await api.uploadModel(payload);
              showToast(`Đã tải lên mô hình "${name}"!`, 'success');
            }
            closeModal();
            state.grade = payload.grade;
            await refresh(false);
          } catch (err) {
            showToast(err.message, 'error');
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
        render();
      });
    });

    rootEl.querySelector('#btnSwitchManage')?.addEventListener('click', () => {
      state.mode = 'manage';
      render();
    });

    rootEl.querySelector('#btnSwitchShowcase')?.addEventListener('click', () => {
      state.mode = 'showcase';
      render();
    });

    if (!inManage) return;

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
        let uploaded = 0;
        for (const f of files) {
          const html = await f.text();
          const tm = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          const name = tm ? tm[1].trim() : f.name.replace(/\.html?$/i, '');
          try {
            await api.uploadModel({
              name,
              fileName: f.name,
              grade: state.grade,
              chapterId,
              lessonId,
              visible: true,
              thumbnail: '',
              html,
            });
            uploaded++;
          } catch (err) {
            showToast(err.message, 'error');
          }
        }
        if (uploaded > 0) {
          showToast(`Đã tải lên ${uploaded} mô hình vào bài học!`, 'success');
          await refresh(false);
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

  return { init };
}
