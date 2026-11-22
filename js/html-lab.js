import { api } from './api.js';
import { escapeHtml } from './exam-engine.js';

const DEMO_CUBIC_HTML = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8" />
<style>
  * { box-sizing: border-box; font-family: system-ui, -apple-system, sans-serif; }
  body { margin: 0; padding: 18px; background: #f8fafc; color: #0f172a; }
  .wrap { max-width: 860px; margin: 0 auto; display: grid; grid-template-columns: 270px 1fr; gap: 18px; align-items: start; }
  .panel { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 16px; }
  h2 { margin: 0 0 8px; font-size: 1rem; color: #1d4ed8; }
  .eq { font-family: ui-monospace, monospace; background: #eff6ff; color: #1e40af; padding: 8px 10px; border-radius: 8px; font-weight: 700; font-size: 0.9rem; margin-bottom: 14px; }
  .ctrl { margin-bottom: 12px; }
  .ctrl label { display: flex; justify-content: space-between; font-size: 0.84rem; font-weight: 600; margin-bottom: 4px; }
  input[type=range] { width: 100%; accent-color: #1d4ed8; }
  .info { font-size: 0.82rem; color: #475569; background: #f1f5f9; padding: 10px; border-radius: 8px; line-height: 1.5; }
  canvas { width: 100%; height: 460px; background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; display: block; }
  @media (max-width: 720px) { .wrap { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<div class="wrap">
  <div class="panel">
    <h2>Khảo sát hàm số bậc ba</h2>
    <div class="eq" id="eqText">y = 1x³ + 0x² - 3x + 1</div>
    <div class="ctrl"><label>Hệ số a <span id="va">1</span></label><input id="sa" type="range" min="-2" max="2" step="0.2" value="1"></div>
    <div class="ctrl"><label>Hệ số b <span id="vb">0</span></label><input id="sb" type="range" min="-4" max="4" step="0.2" value="0"></div>
    <div class="ctrl"><label>Hệ số c <span id="vc">-3</span></label><input id="sc" type="range" min="-6" max="6" step="0.2" value="-3"></div>
    <div class="ctrl"><label>Hệ số d <span id="vd">1</span></label><input id="sd" type="range" min="-4" max="4" step="0.2" value="1"></div>
    <div class="info" id="extremaInfo"></div>
  </div>
  <canvas id="cv" width="580" height="460"></canvas>
</div>
<script>
  const cv = document.getElementById('cv');
  const ctx = cv.getContext('2d');
  const ids = ['a','b','c','d'];
  function draw() {
    const a = parseFloat(document.getElementById('sa').value);
    const b = parseFloat(document.getElementById('sb').value);
    const c = parseFloat(document.getElementById('sc').value);
    const d = parseFloat(document.getElementById('sd').value);
    ids.forEach((k, i) => document.getElementById('v'+k).textContent = [a,b,c,d][i].toFixed(1));
    document.getElementById('eqText').textContent =
      'y = ' + a.toFixed(1) + 'x³ ' + (b>=0?'+ ':'- ') + Math.abs(b).toFixed(1) + 'x² ' +
      (c>=0?'+ ':'- ') + Math.abs(c).toFixed(1) + 'x ' + (d>=0?'+ ':'- ') + Math.abs(d).toFixed(1);
    const W = cv.width, H = cv.height, cx = W/2, cy = H/2, scale = 48;
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = '#f1f5f9'; ctx.lineWidth = 1;
    for (let x = cx % scale; x < W; x += scale) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = cy % scale; y < H; y += scale) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.strokeStyle = '#334155'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();
    ctx.strokeStyle = '#1d4ed8'; ctx.lineWidth = 3;
    ctx.beginPath();
    let started = false;
    for (let px = 0; px <= W; px += 2) {
      const x = (px - cx) / scale;
      const y = a*x*x*x + b*x*x + c*x + d;
      const py = cy - y * scale;
      if (py < -200 || py > H + 200) { started = false; continue; }
      if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
    }
    ctx.stroke();
    const delta = 4*b*b - 12*a*c;
    const info = document.getElementById('extremaInfo');
    if (Math.abs(a) < 0.05) {
      info.innerHTML = '<strong>Lưu ý:</strong> Hệ số a ≈ 0 (suy biến về bậc hai / bậc nhất).';
    } else if (delta > 0) {
      const x1 = (-2*b - Math.sqrt(delta)) / (6*a);
      const x2 = (-2*b + Math.sqrt(delta)) / (6*a);
      const pts = [x1, x2].map(x => ({ x, y: a*x*x*x + b*x*x + c*x + d }));
      pts.forEach(p => {
        ctx.fillStyle = '#e11d48';
        ctx.beginPath(); ctx.arc(cx + p.x*scale, cy - p.y*scale, 5.5, 0, Math.PI*2); ctx.fill();
      });
      info.innerHTML = '<strong>2 điểm cực trị:</strong><br>• (' + pts[0].x.toFixed(2) + '; ' + pts[0].y.toFixed(2) + ')<br>• (' + pts[1].x.toFixed(2) + '; ' + pts[1].y.toFixed(2) + ')';
    } else {
      info.innerHTML = '<strong>Không có cực trị</strong> (hàm số đơn điệu trên ℝ).';
    }
  }
  ids.forEach(k => document.getElementById('s'+k).addEventListener('input', draw));
  draw();
</script>
</body>
</html>`;

const DEMO_HARMONIC_HTML = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8" />
<style>
  * { box-sizing: border-box; font-family: system-ui, sans-serif; }
  body { margin: 0; padding: 18px; background: #f8fafc; color: #0f172a; }
  .box { max-width: 860px; margin: 0 auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 16px; }
  .top { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .ctrls { display: flex; flex-wrap: wrap; gap: 16px; font-size: 0.85rem; font-weight: 600; }
  canvas { width: 100%; height: 360px; background: #0f172a; border-radius: 12px; display: block; }
  button { padding: 7px 14px; border-radius: 8px; border: none; background: #0f766e; color: #fff; font-weight: 700; cursor: pointer; }
</style>
</head>
<body>
<div class="box">
  <div class="top">
    <div class="ctrls">
      <label>Biên độ A: <input id="amp" type="range" min="30" max="110" value="80"></label>
      <label>Tần số góc ω: <input id="omg" type="range" min="1" max="5" step="0.2" value="2.2"></label>
    </div>
    <button id="toggleBtn">Tạm dừng</button>
  </div>
  <canvas id="c" width="820" height="360"></canvas>
</div>
<script>
  const c = document.getElementById('c'), ctx = c.getContext('2d');
  let t = 0, running = true;
  document.getElementById('toggleBtn').onclick = (e) => {
    running = !running;
    e.target.textContent = running ? 'Tạm dừng' : 'Tiếp tục';
  };
  function frame() {
    const A = +document.getElementById('amp').value;
    const w = +document.getElementById('omg').value;
    ctx.clearRect(0, 0, c.width, c.height);
    const ox = 160, oy = 180;
    ctx.strokeStyle = '#334155'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(ox, oy, A, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(30, oy); ctx.lineTo(800, oy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ox, 30); ctx.lineTo(ox, 330); ctx.stroke();
    const angle = w * t;
    const px = ox + A * Math.cos(angle);
    const py = oy - A * Math.sin(angle);
    ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(px, py); ctx.stroke();
    ctx.fillStyle = '#f43f5e';
    ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI*2); ctx.fill();
    const waveX = 320;
    ctx.strokeStyle = 'rgba(244,63,94,0.6)'; ctx.setLineDash([5,5]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(waveX, py); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#2dd4bf'; ctx.lineWidth = 3;
    ctx.beginPath();
    for (let dx = 0; dx < 460; dx += 2) {
      const y = oy - A * Math.sin(angle - dx * 0.025);
      if (dx === 0) ctx.moveTo(waveX + dx, y); else ctx.lineTo(waveX + dx, y);
    }
    ctx.stroke();
    ctx.fillStyle = '#2dd4bf';
    ctx.beginPath(); ctx.arc(waveX, py, 5, 0, Math.PI*2); ctx.fill();
    if (running) t += 0.016;
    requestAnimationFrame(frame);
  }
  frame();
</script>
</body>
</html>`;

const BUILTIN_MODELS = [
  {
    id: 'builtin-cubic',
    name: 'Khảo sát đồ thị hàm số bậc 3 (Demo HTML)',
    fileName: 'khao-sat-ham-bac-3.html',
    isBuiltin: true,
    addedAt: 'Mẫu có sẵn',
    html: DEMO_CUBIC_HTML,
  },
  {
    id: 'builtin-harmonic',
    name: 'Dao động điều hòa & Đường tròn lượng giác (Demo HTML)',
    fileName: 'dao-dong-dieu-hoa.html',
    isBuiltin: true,
    addedAt: 'Mẫu có sẵn',
    html: DEMO_HARMONIC_HTML,
  },
];

export function createHtmlLabController({ rootEl, uiHelpers, getUser }) {
  const { showToast } = uiHelpers;
  const state = {
    serverModels: [],
    activeId: BUILTIN_MODELS[0].id,
  };

  function getAllModels() {
    return [...state.serverModels, ...BUILTIN_MODELS];
  }

  function getActiveModel() {
    const all = getAllModels();
    return all.find((m) => m.id === state.activeId) || all[0];
  }

  async function init() {
    try {
      const res = await api.getModels();
      state.serverModels = res.models || [];
    } catch {
      state.serverModels = [];
    }
    render();
  }

  function render() {
    const user = getUser?.();
    const isAdmin = user?.role === 'admin';
    const models = getAllModels();
    const active = getActiveModel();
    if (active) state.activeId = active.id;

    rootEl.innerHTML = `
      <div class="lab-layout">
        <aside class="lab-sidebar">
          ${
            isAdmin
              ? `
                <div class="card panel-card">
                  <h3 style="margin-bottom:10px;">Tải lên mô hình (.html)</h3>
                  <div class="dropzone" id="htmlDropzone">
                    <input type="file" id="htmlFileInput" accept=".html,.htm,text/html" multiple hidden />
                    <div class="dropzone-icon" style="color:var(--p3-text);">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                    </div>
                    <div class="dropzone-title">Thả file mô hình .html vào đây</div>
                    <div class="dropzone-sub">Lưu trên máy chủ • Toàn bộ học sinh có thể xem &amp; tương tác</div>
                  </div>
                </div>
              `
              : ''
          }

          <div class="card panel-card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
              <strong style="font-size:0.95rem;">Thư viện mô hình</strong>
              <span class="badge badge-p3">${models.length} mô hình</span>
            </div>
            <div class="lab-model-list">
              ${models
                .map(
                  (m) => `
                <div class="lab-model-item ${m.id === state.activeId ? 'active' : ''}" data-model-id="${m.id}">
                  <div class="lab-model-title">
                    <span>${escapeHtml(m.name)}</span>
                    <span class="badge ${m.isBuiltin ? 'badge-neutral' : 'badge-p3'}">${m.isBuiltin ? 'Mẫu' : 'GV tải lên'}</span>
                  </div>
                  <div class="lab-model-meta">${escapeHtml(m.fileName)} • ${escapeHtml(m.addedAt)}</div>
                </div>
              `
                )
                .join('')}
            </div>
          </div>
        </aside>

        <section class="lab-stage">
          <div class="lab-stage-bar">
            <div>
              <strong style="font-size:0.96rem;">${active ? escapeHtml(active.name) : 'Chưa chọn mô hình'}</strong>
              <div style="font-size:0.76rem; color:var(--text-muted);">${active ? escapeHtml(active.fileName) : ''}</div>
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <button class="btn btn-secondary btn-sm" id="btnReloadModel">Tải lại</button>
              <button class="btn btn-secondary btn-sm" id="btnOpenNewTab">Mở tab mới</button>
              <button class="btn btn-primary btn-sm" id="btnFullscreenModel">Toàn màn hình</button>
              ${
                isAdmin && active && !active.isBuiltin
                  ? `<button class="btn btn-danger-outline btn-sm" id="btnDeleteModel">Xóa</button>`
                  : ''
              }
            </div>
          </div>
          <div class="lab-iframe-wrap" id="labIframeWrap">
            <iframe
              id="labIframe"
              class="lab-iframe"
              sandbox="allow-scripts allow-forms allow-modals allow-popups"
              title="Trình chạy mô hình tương tác HTML"
            ></iframe>
          </div>
        </section>
      </div>
    `;

    const iframe = rootEl.querySelector('#labIframe');
    if (iframe && active) iframe.srcdoc = active.html;

    bindEvents(active, isAdmin);
  }

  function bindEvents(active, isAdmin) {
    if (isAdmin) {
      const dropzone = rootEl.querySelector('#htmlDropzone');
      const fileInput = rootEl.querySelector('#htmlFileInput');
      if (dropzone && fileInput) {
        dropzone.addEventListener('click', () => fileInput.click());
        dropzone.addEventListener('dragover', (e) => {
          e.preventDefault();
          dropzone.classList.add('drag-over');
        });
        dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
        dropzone.addEventListener('drop', (e) => {
          e.preventDefault();
          dropzone.classList.remove('drag-over');
          if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
        });
        fileInput.addEventListener('change', () => {
          if (fileInput.files?.length) handleFiles(fileInput.files);
          fileInput.value = '';
        });
      }
    }

    rootEl.querySelectorAll('[data-model-id]').forEach((item) => {
      item.addEventListener('click', () => {
        state.activeId = item.dataset.modelId;
        render();
      });
    });

    rootEl.querySelector('#btnReloadModel')?.addEventListener('click', () => {
      const iframe = rootEl.querySelector('#labIframe');
      if (iframe && active) {
        iframe.srcdoc = '';
        requestAnimationFrame(() => {
          iframe.srcdoc = active.html;
        });
      }
    });

    rootEl.querySelector('#btnFullscreenModel')?.addEventListener('click', () => {
      const wrap = rootEl.querySelector('#labIframeWrap');
      if (wrap?.requestFullscreen) wrap.requestFullscreen();
    });

    rootEl.querySelector('#btnOpenNewTab')?.addEventListener('click', () => {
      if (!active) return;
      const blob = new Blob([active.html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
    });

    rootEl.querySelector('#btnDeleteModel')?.addEventListener('click', async () => {
      if (!active || active.isBuiltin) return;
      try {
        await api.deleteModel(active.id);
        showToast(`Đã xóa mô hình "${active.name}".`, 'success');
        await init();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  async function handleFiles(fileList) {
    let added = 0;
    for (const file of Array.from(fileList)) {
      if (!/\.html?$/i.test(file.name)) {
        showToast(`Bỏ qua "${file.name}" (chỉ hỗ trợ file .html).`, 'error');
        continue;
      }
      const html = await file.text();
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const niceName = titleMatch ? titleMatch[1].trim() : file.name.replace(/\.html?$/i, '');
      try {
        const res = await api.uploadModel({ name: niceName, fileName: file.name, html });
        if (res.model) state.activeId = res.model.id;
        added++;
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
    if (added > 0) {
      showToast(`Đã tải lên ${added} mô hình HTML lên máy chủ!`, 'success');
      await init();
    }
  }

  return { init };
}
