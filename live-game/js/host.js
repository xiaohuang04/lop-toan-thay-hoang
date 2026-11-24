/**
 * Edu Live Game — Teacher Host & Projector Controller
 * Views: library | editor | room (lobby / answering / review / leaderboard / finished)
 */
(function () {
  "use strict";

  const { escapeHtml, formatRichText, renderMathIn, getTypeMeta } = window.LiveMath;

  // Detect embedded mode inside edu-exam-2025 iframe/tab
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("embed") === "1") {
    document.body.classList.add("is-embedded");
  }

  const root = document.getElementById("hostRoot");
  const modalRoot = document.getElementById("modalRoot");
  const toastContainer = document.getElementById("toastContainer");

  const OPT_COLORS = ["#2563eb", "#0d9488", "#d97706", "#9333ea"];

  const app = {
    view: "library", // library | editor | room
    sets: [],
    serverInfo: { lanIps: [] },
    // Editor state
    editSet: null,
    editQIndex: 0,
    // Live Room state
    roomCode: null,
    hostToken: null,
    roomState: null,
    customJoinBaseUrl: "",
    sse: null,
    pollTimer: null,
    countdownTimer: null,
    localRemaining: null,
    showMiniQr: false,
  };

  function toast(msg, type = "info") {
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = msg;
    toastContainer.appendChild(el);
    setTimeout(() => el.remove(), 3400);
  }

  async function api(url, opts = {}) {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
      ...opts,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Lỗi kết nối (${res.status})`);
    }
    return data;
  }

  function getJoinBaseUrl() {
    if (app.customJoinBaseUrl.trim()) {
      return app.customJoinBaseUrl.trim().replace(/\/+$/, "");
    }
    const loc = window.location;
    // If teacher opened on localhost and we detected a Wi-Fi LAN IP, default to LAN IP so phones can scan!
    if ((loc.hostname === "localhost" || loc.hostname === "127.0.0.1") && app.serverInfo.lanIps && app.serverInfo.lanIps.length > 0) {
      const portPart = loc.port ? `:${loc.port}` : "";
      return `${loc.protocol}//${app.serverInfo.lanIps[0]}${portPart}`;
    }
    return loc.origin;
  }

  function getJoinUrl() {
    if (!app.roomCode) return `${getJoinBaseUrl()}/play`;
    return `${getJoinBaseUrl()}/play/${app.roomCode}`;
  }

  // =========================================================================
  // INITIALIZATION & NAVIGATION
  // =========================================================================
  async function init() {
    try {
      const [infoRes, setsRes] = await Promise.all([
        api("/api/live/info"),
        api("/api/live/sets"),
      ]);
      app.serverInfo = infoRes;
      app.sets = setsRes.sets || [];
    } catch (err) {
      toast(err.message, "error");
    }

    document.getElementById("btnHomeBrand")?.addEventListener("click", goLibrary);
    document.getElementById("btnTopLibrary")?.addEventListener("click", goLibrary);

    // Keyboard shortcuts during live stage
    window.addEventListener("keydown", (e) => {
      if (app.view !== "room" || !app.roomState) return;
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (app.roomState.phase === "lobby") sendAction("start");
        else sendAction("next");
      } else if (e.key === "l" || e.key === "L") {
        if (app.roomState.phase === "answering") sendAction("lock");
      } else if (e.key === "r" || e.key === "R") {
        if (app.roomState.phase === "review" || app.roomState.phase === "answering") sendAction("reveal");
      } else if (e.key === "e" || e.key === "E") {
        if (app.roomState.phase === "review" || app.roomState.phase === "answering") sendAction("toggle_explanation");
      }
    });

    render();
  }

  function disconnectRoomStreams() {
    if (app.sse) {
      app.sse.close();
      app.sse = null;
    }
    if (app.pollTimer) {
      clearInterval(app.pollTimer);
      app.pollTimer = null;
    }
    if (app.countdownTimer) {
      clearInterval(app.countdownTimer);
      app.countdownTimer = null;
    }
  }

  async function goLibrary() {
    disconnectRoomStreams();
    app.view = "library";
    try {
      const setsRes = await api("/api/live/sets");
      app.sets = setsRes.sets || [];
    } catch (_) {}
    render();
  }

  // =========================================================================
  // RENDER DISPATCHER
  // =========================================================================
  function render() {
    if (app.view === "library") renderLibrary();
    else if (app.view === "editor") renderEditor();
    else if (app.view === "room") renderRoom();
  }

  // =========================================================================
  // VIEW 1: QUESTION SET LIBRARY
  // =========================================================================
  function renderLibrary() {
    const setsHtml = app.sets.length
      ? app.sets
          .map((s) => {
            const typeCounts = {};
            (s.questions || []).forEach((q) => {
              typeCounts[q.type] = (typeCounts[q.type] || 0) + 1;
            });
            const chips = Object.entries(typeCounts)
              .map(([t, cnt]) => {
                const m = getTypeMeta(t);
                return `<span class="badge badge-${m.color}">${m.short} (${cnt})</span>`;
              })
              .join("");

            return `
              <article class="set-card">
                <div class="set-card-head">
                  <div>
                    <span class="badge badge-blue" style="margin-bottom:6px;">${escapeHtml(s.subject || "Lớp học")}</span>
                    <h3 class="set-card-title">${escapeHtml(s.title)}</h3>
                  </div>
                  <span class="badge badge-success">${(s.questions || []).length} câu</span>
                </div>
                <p class="set-card-desc">${escapeHtml(s.description || "Bộ câu hỏi tương tác trực tiếp trên lớp.")}</p>
                <div class="set-type-chips">${chips || '<span class="badge badge-amber">Chưa có câu hỏi</span>'}</div>
                <div class="set-card-footer">
                  <button class="btn btn-primary" data-launch="${escapeHtml(s.id)}">▶ Mở phòng chơi (QR)</button>
                  <div style="display:flex; gap:6px;">
                    <button class="btn btn-outline btn-sm" data-edit="${escapeHtml(s.id)}">Sửa</button>
                    <button class="btn btn-outline btn-sm" data-dup="${escapeHtml(s.id)}">Nhân bản</button>
                    <button class="btn btn-ghost btn-sm" style="color:var(--danger);" data-del="${escapeHtml(s.id)}">Xóa</button>
                  </div>
                </div>
              </article>
            `;
          })
          .join("")
      : `<div class="card" style="text-align:center; padding:40px;">Chưa có bộ câu hỏi nào. Hãy nhập từ Excel/CSV hoặc tạo mới!</div>`;

    root.innerHTML = `
      <section class="hero-banner">
        <div>
          <h1>Game Tương Tác Lớp Học (40–50 Học Sinh)</h1>
          <p>Học sinh quét mã QR trên điện thoại để trả lời Trắc nghiệm, Đúng/Sai, Trả lời ngắn, Điền chỗ trống và Kéo thả. Kết quả tổng hợp tức thì lên màn hình chiếu để thầy/cô phân tích &amp; giải thích.</p>
        </div>
        <div class="hero-actions">
          <button class="btn btn-white btn-lg" id="btnOpenImport">📥 Nhập Excel / CSV</button>
          <button class="btn btn-glass btn-lg" id="btnNewSet">＋ Soạn bộ câu hỏi mới</button>
        </div>
      </section>

      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; flex-wrap:wrap; gap:10px;">
        <h2 style="margin:0; font-size:1.18rem;">Kho bộ câu hỏi (${app.sets.length})</h2>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <a class="btn btn-outline btn-sm" href="/api/live/template/xlsx">⬇ Tải file mẫu Excel (.xlsx)</a>
          <a class="btn btn-outline btn-sm" href="/api/live/template/csv">⬇ Tải file mẫu CSV</a>
        </div>
      </div>

      <section class="sets-grid">${setsHtml}</section>
    `;

    document.getElementById("btnOpenImport").onclick = openImportModal;
    document.getElementById("btnNewSet").onclick = () => {
      app.editSet = {
        id: null,
        title: "Bộ câu hỏi tương tác mới",
        subject: "Toán 12",
        description: "",
        questions: [createBlankQuestion("mcq")],
      };
      app.editQIndex = 0;
      app.view = "editor";
      render();
    };

    root.querySelectorAll("[data-launch]").forEach((btn) => {
      btn.onclick = () => launchRoom(btn.dataset.launch);
    });
    root.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.onclick = () => {
        const found = app.sets.find((s) => s.id === btn.dataset.edit);
        if (!found) return;
        app.editSet = JSON.parse(JSON.stringify(found));
        if (!app.editSet.questions.length) app.editSet.questions.push(createBlankQuestion("mcq"));
        app.editQIndex = 0;
        app.view = "editor";
        render();
      };
    });
    root.querySelectorAll("[data-dup]").forEach((btn) => {
      btn.onclick = async () => {
        try {
          await api(`/api/live/sets/${btn.dataset.dup}/duplicate`, { method: "POST" });
          toast("Đã nhân bản bộ câu hỏi.", "success");
          goLibrary();
        } catch (err) {
          toast(err.message, "error");
        }
      };
    });
    root.querySelectorAll("[data-del]").forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm("Bạn có chắc muốn xóa bộ câu hỏi này?")) return;
        try {
          await api(`/api/live/sets/${btn.dataset.del}`, { method: "DELETE" });
          toast("Đã xóa bộ câu hỏi.", "success");
          goLibrary();
        } catch (err) {
          toast(err.message, "error");
        }
      };
    });
  }

  // =========================================================================
  // IMPORT EXCEL / CSV / JSON MODAL
  // =========================================================================
  function openImportModal() {
    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="importBackdrop">
        <div class="modal-box">
          <div class="modal-head">
            <h3 style="margin:0; font-size:1.18rem;">📥 Nhập bộ câu hỏi từ Excel / CSV / JSON</h3>
            <button class="btn btn-ghost btn-sm" id="btnCloseImport">✕</button>
          </div>
          <p style="margin:0 0 14px; font-size:0.9rem; color:var(--text-secondary);">
            Hỗ trợ trực tiếp file <strong>.xlsx</strong> (Excel/Google Sheets), <strong>.csv</strong> và <strong>.json</strong> với đủ 6 dạng câu hỏi và công thức toán KaTeX <code>$...$</code>.
          </p>
          <div style="display:flex; gap:8px; margin-bottom:16px; flex-wrap:wrap;">
            <a class="btn btn-soft btn-sm" href="/api/live/template/xlsx">⬇ Tải file Excel mẫu (.xlsx)</a>
            <a class="btn btn-outline btn-sm" href="/api/live/template/csv">⬇ Tải file CSV mẫu (.csv)</a>
          </div>
          <div class="form-grid-2" style="margin-bottom:14px;">
            <div>
              <label class="field-label">Tên bộ câu hỏi (tùy chọn)</label>
              <input id="impTitle" class="input" placeholder="Để trống sẽ lấy theo tên file" />
            </div>
            <div>
              <label class="field-label">Môn học / Chủ đề</label>
              <input id="impSubject" class="input" value="Toán học" />
            </div>
          </div>
          <div class="dropzone" id="impDropzone">
            <div style="font-size:2rem; margin-bottom:6px;">📄</div>
            <div style="font-weight:700; color:var(--primary);">Kéo thả file Excel (.xlsx), CSV hoặc JSON vào đây</div>
            <div style="font-size:0.84rem; color:var(--text-muted); margin-top:4px;">hoặc bấm để chọn tệp từ máy tính</div>
            <input type="file" id="impFileInput" accept=".xlsx,.csv,.json,.txt" class="hidden" />
          </div>
          <div id="impStatus" style="margin-top:12px; font-size:0.88rem;"></div>
        </div>
      </div>
    `;

    const close = () => { modalRoot.innerHTML = ""; };
    document.getElementById("btnCloseImport").onclick = close;
    document.getElementById("importBackdrop").onclick = (e) => {
      if (e.target.id === "importBackdrop") close();
    };

    const dz = document.getElementById("impDropzone");
    const fi = document.getElementById("impFileInput");
    dz.onclick = () => fi.click();
    dz.ondragover = (e) => { e.preventDefault(); dz.classList.add("dragover"); };
    dz.ondragleave = () => dz.classList.remove("dragover");
    dz.ondrop = (e) => {
      e.preventDefault();
      dz.classList.remove("dragover");
      if (e.dataTransfer.files && e.dataTransfer.files[0]) handleImportFile(e.dataTransfer.files[0], close);
    };
    fi.onchange = () => {
      if (fi.files && fi.files[0]) handleImportFile(fi.files[0], close);
    };
  }

  function handleImportFile(file, onDone) {
    const statusEl = document.getElementById("impStatus");
    statusEl.innerHTML = `<span style="color:var(--primary); font-weight:600;">Đang đọc tệp ${escapeHtml(file.name)}...</span>`;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await api("/api/live/import", {
          method: "POST",
          body: JSON.stringify({
            filename: file.name,
            title: document.getElementById("impTitle").value.trim(),
            subject: document.getElementById("impSubject").value.trim(),
            contentBase64: reader.result,
          }),
        });
        toast(`Đã nhập thành công ${res.set.questions.length} câu hỏi!`, "success");
        if (res.warnings && res.warnings.length) {
          alert("Lưu ý khi nhập dữ liệu:\n- " + res.warnings.join("\n- "));
        }
        onDone();
        goLibrary();
      } catch (err) {
        statusEl.innerHTML = `<span style="color:var(--danger); font-weight:600;">${escapeHtml(err.message)}</span>`;
      }
    };
    reader.readAsDataURL(file);
  }

  // =========================================================================
  // VIEW 2: VISUAL QUESTION SET EDITOR (ALL 6 TYPES!)
  // =========================================================================
  function createBlankQuestion(type) {
    const id = "q-" + Math.random().toString(36).slice(2, 9);
    const base = { id, type, prompt: "", image: "", timeLimit: 30, points: 1000, explanation: "", data: {} };
    if (type === "mcq") {
      base.prompt = "Nhập nội dung câu hỏi trắc nghiệm...";
      base.data = { options: ["Phương án A", "Phương án B", "Phương án C", "Phương án D"], correctIndex: 0 };
    } else if (type === "true_false") {
      base.prompt = "Xét tính Đúng / Sai của các mệnh đề sau:";
      base.data = {
        statements: [
          { text: "Mệnh đề a...", answer: true },
          { text: "Mệnh đề b...", answer: false },
        ],
      };
    } else if (type === "short_answer") {
      base.prompt = "Nhập câu hỏi trả lời ngắn...";
      base.data = { acceptedAnswers: ["5"], caseSensitive: false, placeholder: "Nhập đáp án của em..." };
    } else if (type === "fill_blank") {
      base.prompt = "Hoàn thành phát biểu sau:";
      base.data = {
        template: "Đạo hàm của $x^2$ là {{0}} và đạo hàm của $\\sin x$ là {{1}}.",
        blanks: [{ accepted: ["2x"] }, { accepted: ["cos x", "\\cos x"] }],
        wordBank: ["2x", "cos x", "-cos x", "x"],
        useWordBank: true,
      };
    } else if (type === "drag_order") {
      base.prompt = "Kéo thả sắp xếp các bước sau theo đúng thứ tự:";
      base.data = { items: ["Bước 1", "Bước 2", "Bước 3", "Bước 4"] };
    } else if (type === "drag_match") {
      base.prompt = "Kéo thả ghép mỗi mục ở cột trái với mục tương ứng ở cột phải:";
      base.data = {
        pairs: [
          { left: "Mục trái 1", right: "Đáp án phải 1" },
          { left: "Mục trái 2", right: "Đáp án phải 2" },
          { left: "Mục trái 3", right: "Đáp án phải 3" },
        ],
      };
    }
    return base;
  }

  function renderEditor() {
    const set = app.editSet;
    if (app.editQIndex >= set.questions.length) app.editQIndex = Math.max(0, set.questions.length - 1);
    const q = set.questions[app.editQIndex];

    const listHtml = set.questions
      .map((item, idx) => {
        const meta = getTypeMeta(item.type);
        return `
          <div class="q-list-item ${idx === app.editQIndex ? "active" : ""}" data-select-q="${idx}">
            <div class="q-num-pill">${idx + 1}</div>
            <div style="min-width:0; flex:1;">
              <div style="font-size:0.75rem; font-weight:700; color:var(--primary);">${meta.short}</div>
              <div style="font-size:0.84rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--text);">
                ${escapeHtml(item.prompt || "(Chưa nhập câu hỏi)")}
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    root.innerHTML = `
      <div class="card" style="margin-bottom:18px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:14px;">
          <button class="btn btn-outline btn-sm" id="btnEdBack">← Quay lại thư viện</button>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn btn-outline" id="btnEdSave">💾 Lưu bộ câu hỏi</button>
            <button class="btn btn-primary" id="btnEdSaveLaunch">▶ Lưu &amp; Mở phòng chơi</button>
          </div>
        </div>
        <div class="form-grid-2">
          <div>
            <label class="field-label">Tên bộ câu hỏi</label>
            <input id="edSetTitle" class="input" value="${escapeHtml(set.title)}" />
          </div>
          <div>
            <label class="field-label">Môn học / Lớp</label>
            <input id="edSetSubject" class="input" value="${escapeHtml(set.subject || "")}" />
          </div>
        </div>
      </div>

      <div class="editor-layout">
        <aside class="card">
          <div style="font-weight:800; margin-bottom:10px;">Danh sách câu hỏi (${set.questions.length})</div>
          <div id="edQList" style="max-height:460px; overflow-y:auto; margin-bottom:12px;">${listHtml}</div>
          <div style="font-size:0.78rem; font-weight:700; color:var(--text-muted); margin-bottom:8px;">THÊM CÂU HỎI DẠNG:</div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
            <button class="btn btn-soft btn-sm" data-add-type="mcq">+ Trắc nghiệm</button>
            <button class="btn btn-soft btn-sm" data-add-type="true_false">+ Đúng / Sai</button>
            <button class="btn btn-soft btn-sm" data-add-type="short_answer">+ Trả lời ngắn</button>
            <button class="btn btn-soft btn-sm" data-add-type="fill_blank">+ Điền chỗ trống</button>
            <button class="btn btn-soft btn-sm" data-add-type="drag_order">+ Sắp xếp</button>
            <button class="btn btn-soft btn-sm" data-add-type="drag_match">+ Ghép đôi</button>
          </div>
        </aside>

        <section class="card" id="edQFormWrap"></section>
      </div>
    `;

    document.getElementById("btnEdBack").onclick = goLibrary;
    document.getElementById("edSetTitle").oninput = (e) => { set.title = e.target.value; };
    document.getElementById("edSetSubject").oninput = (e) => { set.subject = e.target.value; };

    document.getElementById("btnEdSave").onclick = () => saveEditedSet(false);
    document.getElementById("btnEdSaveLaunch").onclick = () => saveEditedSet(true);

    root.querySelectorAll("[data-select-q]").forEach((el) => {
      el.onclick = () => {
        app.editQIndex = Number(el.dataset.selectQ);
        renderEditor();
      };
    });
    root.querySelectorAll("[data-add-type]").forEach((btn) => {
      btn.onclick = () => {
        set.questions.push(createBlankQuestion(btn.dataset.addType));
        app.editQIndex = set.questions.length - 1;
        renderEditor();
      };
    });

    if (q) renderQuestionEditorForm(q);
  }

  function renderQuestionEditorForm(q) {
    const wrap = document.getElementById("edQFormWrap");
    const meta = getTypeMeta(q.type);
    const idx = app.editQIndex;
    const total = app.editSet.questions.length;

    let typeFieldsHtml = "";
    if (q.type === "mcq") {
      typeFieldsHtml = `
        <div style="margin-top:16px;">
          <label class="field-label">4 phương án trả lời (chọn đáp án đúng ở nút tròn bên trái)</label>
          ${(q.data.options || ["", "", "", ""]).map((opt, i) => `
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
              <input type="radio" name="mcqCorrect" value="${i}" ${Number(q.data.correctIndex) === i ? "checked" : ""} style="width:18px; height:18px; accent-color:var(--success);" />
              <span class="opt-letter-badge" style="width:30px; height:30px; font-size:0.85rem; background:${OPT_COLORS[i]};">${String.fromCharCode(65 + i)}</span>
              <input class="input" data-mcq-opt="${i}" value="${escapeHtml(opt)}" placeholder="Nội dung đáp án ${String.fromCharCode(65 + i)} (hỗ trợ $KaTeX$)" />
            </div>
          `).join("")}
        </div>
      `;
    } else if (q.type === "true_false") {
      const stmts = q.data.statements || [{ text: "", answer: true }];
      typeFieldsHtml = `
        <div style="margin-top:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <label class="field-label" style="margin:0;">Các mệnh đề Đúng / Sai (1 mệnh đề để trống text sẽ dùng trực tiếp câu hỏi ở trên; hoặc nhập 2–4 ý a,b,c,d chuẩn 2025)</label>
            <button class="btn btn-soft btn-sm" id="btnAddTfStmt">+ Thêm mệnh đề</button>
          </div>
          ${stmts.map((st, i) => `
            <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
              <span class="badge badge-purple">${String.fromCharCode(97 + i)})</span>
              <input class="input" data-tf-text="${i}" value="${escapeHtml(st.text || "")}" placeholder="Nội dung mệnh đề ${String.fromCharCode(97 + i)}..." />
              <select class="select" style="width:120px;" data-tf-ans="${i}">
                <option value="true" ${st.answer ? "selected" : ""}>Đúng</option>
                <option value="false" ${!st.answer ? "selected" : ""}>Sai</option>
              </select>
              ${stmts.length > 1 ? `<button class="btn btn-ghost btn-sm" data-tf-del="${i}" style="color:var(--danger);">✕</button>` : ""}
            </div>
          `).join("")}
        </div>
      `;
    } else if (q.type === "short_answer") {
      typeFieldsHtml = `
        <div style="margin-top:16px;" class="form-grid-2">
          <div>
            <label class="field-label">Đáp án chấp nhận (cách nhau bởi dấu <code>|</code>)</label>
            <input class="input" id="edShortAcc" value="${escapeHtml((q.data.acceptedAnswers || []).join(" | "))}" placeholder="Ví dụ: 3,5 | 3.5 | 7/2" />
          </div>
          <div>
            <label class="field-label">Gợi ý ô nhập cho học sinh</label>
            <input class="input" id="edShortPh" value="${escapeHtml(q.data.placeholder || "")}" placeholder="Nhập đáp án..." />
          </div>
        </div>
      `;
    } else if (q.type === "fill_blank") {
      // Reconstruct human-friendly {{answer}} syntax for easy editing
      let editableTpl = q.data.template || "";
      (q.data.blanks || []).forEach((b, i) => {
        editableTpl = editableTpl.replace(`{{${i}}}`, `{{${(b.accepted || [""]).join("|")}}}`);
      });
      typeFieldsHtml = `
        <div style="margin-top:16px;">
          <label class="field-label">Đoạn văn có chỗ trống (bọc đáp án đúng trong <code>{{đáp án}}</code> — có thể dùng <code>|</code> cho nhiều cách viết)</label>
          <textarea class="textarea" id="edClozeTpl">${escapeHtml(editableTpl)}</textarea>
          <div style="margin-top:10px;">
            <label class="field-label">Ngân hàng từ kéo thả (cách nhau dấu <code>|</code> — để trống nếu muốn học sinh tự gõ tay)</label>
            <input class="input" id="edClozeWb" value="${escapeHtml((q.data.wordBank || []).join(" | "))}" placeholder="Ví dụ: -1 | 1 | 2 | -2 | 0" />
          </div>
        </div>
      `;
    } else if (q.type === "drag_order") {
      const items = q.data.items || ["", ""];
      typeFieldsHtml = `
        <div style="margin-top:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <label class="field-label" style="margin:0;">Các bước theo ĐÚNG THỨ TỰ (hệ thống sẽ tự động xáo trộn khi gửi xuống điện thoại học sinh)</label>
            <button class="btn btn-soft btn-sm" id="btnAddOrderItem">+ Thêm mục</button>
          </div>
          ${items.map((it, i) => `
            <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
              <span class="badge badge-indigo">Bước ${i + 1}</span>
              <input class="input" data-ord-item="${i}" value="${escapeHtml(it)}" />
              ${items.length > 2 ? `<button class="btn btn-ghost btn-sm" data-ord-del="${i}" style="color:var(--danger);">✕</button>` : ""}
            </div>
          `).join("")}
        </div>
      `;
    } else if (q.type === "drag_match") {
      const pairs = q.data.pairs || [{ left: "", right: "" }, { left: "", right: "" }];
      typeFieldsHtml = `
        <div style="margin-top:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <label class="field-label" style="margin:0;">Các cặp ghép ĐÚNG (cột phải sẽ tự xáo trộn trên điện thoại học sinh)</label>
            <button class="btn btn-soft btn-sm" id="btnAddMatchPair">+ Thêm cặp</button>
          </div>
          ${pairs.map((p, i) => `
            <div style="display:grid; grid-template-columns:1fr 24px 1fr auto; gap:8px; align-items:center; margin-bottom:8px;">
              <input class="input" data-match-left="${i}" value="${escapeHtml(p.left)}" placeholder="Vế trái ${i + 1}" />
              <div style="text-align:center; font-weight:800; color:var(--text-muted);">⇄</div>
              <input class="input" data-match-right="${i}" value="${escapeHtml(p.right)}" placeholder="Vế phải tương ứng ${i + 1}" />
              ${pairs.length > 2 ? `<button class="btn btn-ghost btn-sm" data-match-del="${i}" style="color:var(--danger);">✕</button>` : ""}
            </div>
          `).join("")}
        </div>
      `;
    }

    wrap.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:14px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="badge badge-${meta.color}">Câu ${idx + 1}: ${meta.label}</span>
        </div>
        <div style="display:flex; gap:6px;">
          <button class="btn btn-outline btn-sm" id="btnQMoveUp" ${idx === 0 ? "disabled" : ""}>↑</button>
          <button class="btn btn-outline btn-sm" id="btnQMoveDown" ${idx === total - 1 ? "disabled" : ""}>↓</button>
          <button class="btn btn-ghost btn-sm" style="color:var(--danger);" id="btnQDelete" ${total <= 1 ? "disabled" : ""}>Xóa câu</button>
        </div>
      </div>

      <div class="form-grid-2" style="margin-bottom:14px;">
        <div>
          <label class="field-label">Thời gian trả lời (giây, nhập 0 = không giới hạn)</label>
          <input type="number" min="0" max="600" id="edQTime" class="input" value="${q.timeLimit ?? 30}" />
        </div>
        <div>
          <label class="field-label">Điểm tối đa (khi bật chế độ tính điểm)</label>
          <input type="number" min="100" max="5000" step="100" id="edQPoints" class="input" value="${q.points ?? 1000}" />
        </div>
      </div>

      <div>
        <label class="field-label">Nội dung câu hỏi (hỗ trợ công thức toán KaTeX <code>$...$</code> và <code>$$...$$</code>)</label>
        <textarea id="edQPrompt" class="textarea">${escapeHtml(q.prompt)}</textarea>
        <div class="math-preview-box" id="edQPromptPreview"></div>
      </div>

      ${typeFieldsHtml}

      <div style="margin-top:18px;">
        <label class="field-label">💡 Nội dung Giải thích của Giáo viên (hiện lên màn hình chiếu khi thầy/cô giảng bài)</label>
        <textarea id="edQExpl" class="textarea" placeholder="Nhập lời giải, phân tích lỗi sai phổ biến để giảng cho cả lớp...">${escapeHtml(q.explanation || "")}</textarea>
        <div class="math-preview-box" id="edQExplPreview"></div>
      </div>
    `;

    const updatePreview = (elId, txt) => {
      const el = document.getElementById(elId);
      if (!el) return;
      el.innerHTML = txt ? formatRichText(txt) : '<span style="color:var(--text-muted); font-size:0.84rem;">Xem trước công thức toán...</span>';
      renderMathIn(el);
    };
    updatePreview("edQPromptPreview", q.prompt);
    updatePreview("edQExplPreview", q.explanation);

    document.getElementById("edQTime").oninput = (e) => { q.timeLimit = Math.max(0, parseInt(e.target.value || "0", 10)); };
    document.getElementById("edQPoints").oninput = (e) => { q.points = Math.max(100, parseInt(e.target.value || "1000", 10)); };
    document.getElementById("edQPrompt").oninput = (e) => {
      q.prompt = e.target.value;
      updatePreview("edQPromptPreview", q.prompt);
    };
    document.getElementById("edQExpl").oninput = (e) => {
      q.explanation = e.target.value;
      updatePreview("edQExplPreview", q.explanation);
    };

    document.getElementById("btnQMoveUp").onclick = () => {
      const arr = app.editSet.questions;
      [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
      app.editQIndex = idx - 1;
      renderEditor();
    };
    document.getElementById("btnQMoveDown").onclick = () => {
      const arr = app.editSet.questions;
      [arr[idx + 1], arr[idx]] = [arr[idx], arr[idx + 1]];
      app.editQIndex = idx + 1;
      renderEditor();
    };
    document.getElementById("btnQDelete").onclick = () => {
      app.editSet.questions.splice(idx, 1);
      app.editQIndex = Math.max(0, idx - 1);
      renderEditor();
    };

    // Type-specific bindings
    if (q.type === "mcq") {
      wrap.querySelectorAll('input[name="mcqCorrect"]').forEach((r) => {
        r.onchange = () => { q.data.correctIndex = Number(r.value); };
      });
      wrap.querySelectorAll("[data-mcq-opt]").forEach((inp) => {
        inp.oninput = () => { q.data.options[Number(inp.dataset.mcqOpt)] = inp.value; };
      });
    } else if (q.type === "true_false") {
      document.getElementById("btnAddTfStmt").onclick = () => {
        q.data.statements.push({ text: "", answer: true });
        renderEditor();
      };
      wrap.querySelectorAll("[data-tf-text]").forEach((inp) => {
        inp.oninput = () => { q.data.statements[Number(inp.dataset.tfText)].text = inp.value; };
      });
      wrap.querySelectorAll("[data-tf-ans]").forEach((sel) => {
        sel.onchange = () => { q.data.statements[Number(sel.dataset.tfAns)].answer = sel.value === "true"; };
      });
      wrap.querySelectorAll("[data-tf-del]").forEach((btn) => {
        btn.onclick = () => { q.data.statements.splice(Number(btn.dataset.tfDel), 1); renderEditor(); };
      });
    } else if (q.type === "short_answer") {
      document.getElementById("edShortAcc").oninput = (e) => {
        q.data.acceptedAnswers = e.target.value.split("|").map((s) => s.trim()).filter(Boolean);
      };
      document.getElementById("edShortPh").oninput = (e) => { q.data.placeholder = e.target.value; };
    } else if (q.type === "fill_blank") {
      const syncCloze = () => {
        const raw = document.getElementById("edClozeTpl").value;
        const blanks = [];
        const tpl = raw.replace(/\{\{(.+?)\}\}/g, (_, inner) => {
          const accepted = inner.split("|").map((s) => s.trim()).filter(Boolean);
          const bIdx = blanks.length;
          blanks.push({ accepted: accepted.length ? accepted : [""] });
          return `{{${bIdx}}}`;
        });
        const wb = document.getElementById("edClozeWb").value.split("|").map((s) => s.trim()).filter(Boolean);
        q.data.template = tpl;
        q.data.blanks = blanks.length ? blanks : [{ accepted: [""] }];
        q.data.wordBank = wb;
        q.data.useWordBank = wb.length > 0;
      };
      document.getElementById("edClozeTpl").oninput = syncCloze;
      document.getElementById("edClozeWb").oninput = syncCloze;
    } else if (q.type === "drag_order") {
      document.getElementById("btnAddOrderItem").onclick = () => { q.data.items.push(""); renderEditor(); };
      wrap.querySelectorAll("[data-ord-item]").forEach((inp) => {
        inp.oninput = () => { q.data.items[Number(inp.dataset.ordItem)] = inp.value; };
      });
      wrap.querySelectorAll("[data-ord-del]").forEach((btn) => {
        btn.onclick = () => { q.data.items.splice(Number(btn.dataset.ordDel), 1); renderEditor(); };
      });
    } else if (q.type === "drag_match") {
      document.getElementById("btnAddMatchPair").onclick = () => { q.data.pairs.push({ left: "", right: "" }); renderEditor(); };
      wrap.querySelectorAll("[data-match-left]").forEach((inp) => {
        inp.oninput = () => { q.data.pairs[Number(inp.dataset.matchLeft)].left = inp.value; };
      });
      wrap.querySelectorAll("[data-match-right]").forEach((inp) => {
        inp.oninput = () => { q.data.pairs[Number(inp.dataset.matchRight)].right = inp.value; };
      });
      wrap.querySelectorAll("[data-match-del]").forEach((btn) => {
        btn.onclick = () => { q.data.pairs.splice(Number(btn.dataset.matchDel), 1); renderEditor(); };
      });
    }
  }

  async function saveEditedSet(andLaunch) {
    try {
      const set = app.editSet;
      let res;
      if (set.id) {
        res = await api(`/api/live/sets/${set.id}`, { method: "PUT", body: JSON.stringify(set) });
      } else {
        res = await api("/api/live/sets", { method: "POST", body: JSON.stringify(set) });
      }
      toast("Đã lưu bộ câu hỏi!", "success");
      if (andLaunch) {
        launchRoom(res.set.id);
      } else {
        goLibrary();
      }
    } catch (err) {
      toast(err.message, "error");
    }
  }

  // =========================================================================
  // VIEW 3: LIVE ROOM (LOBBY + PROJECTOR STAGE)
  // =========================================================================
  async function launchRoom(setId) {
    try {
      const res = await api("/api/live/rooms", {
        method: "POST",
        body: JSON.stringify({
          setId,
          settings: {
            scoringEnabled: true,
            showLiveChart: false,
            showNamesOnProjector: false,
            allowChangeAnswer: false,
          },
        }),
      });
      app.roomCode = res.roomCode;
      app.hostToken = res.hostToken;
      app.roomState = res.state;
      app.view = "room";
      connectHostStream();
      render();
      toast(`Đã mở phòng ${res.roomCode}! Học sinh có thể quét mã QR ngay.`, "success");
    } catch (err) {
      toast(err.message, "error");
    }
  }

  function connectHostStream() {
    disconnectRoomStreams();
    if (!app.roomCode || !app.hostToken) return;

    const sseUrl = `/api/live/rooms/${app.roomCode}/events?role=host&token=${encodeURIComponent(app.hostToken)}`;
    const es = new EventSource(sseUrl);
    es.addEventListener("state", (ev) => {
      try {
        const next = JSON.parse(ev.data);
        applyRoomState(next);
      } catch (_) {}
    });
    app.sse = es;

    // Gentle fallback poll every 3.5s in case proxy interrupts SSE
    app.pollTimer = setInterval(async () => {
      if (app.view !== "room" || !app.roomCode) return;
      try {
        const st = await api(`/api/live/rooms/${app.roomCode}/host?token=${encodeURIComponent(app.hostToken)}`);
        if (!app.roomState || st.version !== app.roomState.version) {
          applyRoomState(st);
        }
      } catch (_) {}
    }, 3500);

    // Smooth 0.5s visual countdown tick
    app.countdownTimer = setInterval(() => {
      if (app.view !== "room" || !app.roomState || app.roomState.phase !== "answering") return;
      if (app.localRemaining === null) return;
      app.localRemaining = Math.max(0, +(app.localRemaining - 0.5).toFixed(1));
      const badge = document.getElementById("liveTimerBadge");
      if (badge) {
        const sec = Math.ceil(app.localRemaining);
        badge.textContent = sec > 0 ? `⏱ ${sec}s` : "⏱ Hết giờ";
        badge.classList.toggle("urgent", sec <= 5);
      }
    }, 500);
  }

  function applyRoomState(next) {
    const prevPhase = app.roomState ? app.roomState.phase : null;
    const prevQ = app.roomState ? app.roomState.questionIndex : -1;
    app.roomState = next;
    app.localRemaining = next.remainingSeconds;
    // Avoid stealing focus if teacher is typing inside board note input unless phase/question changed
    const activeEl = document.activeElement;
    if (activeEl && activeEl.id === "teacherBoardNoteInput" && prevPhase === next.phase && prevQ === next.questionIndex) {
      updateLiveCountersOnly();
      return;
    }
    renderRoom();
  }

  function updateLiveCountersOnly() {
    const st = app.roomState;
    if (!st) return;
    const subEl = document.getElementById("liveSubmittedLabel");
    if (subEl && st.analytics) {
      subEl.textContent = `${st.analytics.totalSubmitted || 0} / ${st.playerCount} học sinh đã nộp`;
    }
  }

  async function sendAction(action, extra = {}) {
    if (!app.roomCode || !app.hostToken) return;
    try {
      const res = await api(`/api/live/rooms/${app.roomCode}/action`, {
        method: "POST",
        body: JSON.stringify({ hostToken: app.hostToken, action, ...extra }),
      });
      if (res.state) applyRoomState(res.state);
    } catch (err) {
      toast(err.message, "error");
    }
  }

  function renderRoom() {
    const st = app.roomState;
    if (!st) return;
    if (st.phase === "lobby") renderLobby(st);
    else renderStage(st);
  }

  function renderLobby(st) {
    const joinUrl = getJoinUrl();
    const lanChips = (app.serverInfo.lanIps || [])
      .map((ip) => {
        const portPart = window.location.port ? `:${window.location.port}` : "";
        const u = `${window.location.protocol}//${ip}${portPart}`;
        return `<button class="btn btn-outline btn-sm" data-set-base="${escapeHtml(u)}">Wi-Fi LAN: ${escapeHtml(ip)}</button>`;
      })
      .join("");

    const playersHtml = st.players.length
      ? st.players
          .map(
            (p) => `
            <div class="player-chip">
              <span>${escapeHtml(p.avatar)}</span>
              <span>${escapeHtml(p.name)}</span>
              ${p.className ? `<span style="font-size:0.76rem; color:var(--text-muted);">(${escapeHtml(p.className)})</span>` : ""}
              <button class="kick-btn" data-kick="${escapeHtml(p.id)}" title="Mời ra khỏi phòng">×</button>
            </div>
          `
          )
          .join("")
      : `<div style="color:var(--text-muted); padding:28px 10px; text-align:center; width:100%;">
          Chưa có học sinh nào vào phòng.<br>
          Hãy chiếu màn hình này lên máy chiếu để học sinh quét mã QR, hoặc bấm <strong>"+40 HS ảo"</strong> để test thử ngay!
        </div>`;

    root.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; flex-wrap:wrap; gap:10px;">
        <div>
          <span class="badge badge-blue">${escapeHtml(st.subject || "Phòng chơi trực tiếp")}</span>
          <h1 style="margin:6px 0 0; font-size:1.45rem;">${escapeHtml(st.setTitle)}</h1>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn btn-outline btn-sm" id="btnLobbyExit">← Thoát phòng</button>
          <a class="btn btn-soft btn-sm" href="${escapeHtml(joinUrl)}" target="_blank" rel="noopener">Mở thử tab Học sinh ↗</a>
        </div>
      </div>

      <div class="lobby-grid">
        <section class="qr-hero-card">
          <div style="font-size:0.88rem; text-transform:uppercase; letter-spacing:0.08em; opacity:0.85; font-weight:700;">Quét mã QR bằng điện thoại</div>
          <div class="room-code-display">${escapeHtml(st.code)}</div>
          <div>
            <div class="qr-frame" id="lobbyQrContainer"></div>
          </div>
          <div class="join-url-pill">${escapeHtml(joinUrl)}</div>
          <div style="display:flex; gap:8px; justify-content:center; margin-top:12px; flex-wrap:wrap;">
            <button class="btn btn-sm" style="background:rgba(255,255,255,0.18); color:#fff;" id="btnCopyJoinLink">📋 Sao chép link</button>
            <button class="btn btn-sm" style="background:rgba(255,255,255,0.18); color:#fff;" id="btnEditJoinDomain">⚙ Đổi địa chỉ QR</button>
          </div>
        </section>

        <section style="display:flex; flex-direction:column; gap:16px;">
          <div class="card">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:14px;">
              <h2 style="margin:0; font-size:1.12rem;">Cài đặt buổi tương tác (${st.totalQuestions} câu hỏi)</h2>
              <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <button class="btn btn-outline btn-sm" id="btnSim15">🤖 +15 HS ảo</button>
                <button class="btn btn-soft btn-sm" id="btnSim40">🤖 Test lớp 40 HS ảo</button>
              </div>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:16px;">
              <button class="toggle-pill ${st.settings.scoringEnabled ? "active" : ""}" data-toggle="scoringEnabled">
                <span class="toggle-dot"></span> Tính điểm &amp; Bảng xếp hạng
              </button>
              <button class="toggle-pill ${st.settings.showLiveChart ? "active" : ""}" data-toggle="showLiveChart">
                <span class="toggle-dot"></span> Hiện biểu đồ ngay khi đang trả lời
              </button>
              <button class="toggle-pill ${st.settings.allowChangeAnswer ? "active" : ""}" data-toggle="allowChangeAnswer">
                <span class="toggle-dot"></span> Cho phép sửa đáp án trước khi khóa
              </button>
            </div>
            <button class="btn btn-success btn-lg" style="width:100%; font-size:1.1rem;" id="btnStartGame">
              🚀 Bắt đầu câu hỏi số 1 (${st.playerCount} học sinh sẵn sàng)
            </button>
          </div>

          <div class="card">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
              <h3 style="margin:0; font-size:1.05rem;">Học sinh đã vào phòng</h3>
              <span class="badge badge-success" style="font-size:0.9rem;">${st.playerCount} học sinh</span>
            </div>
            <div class="roster-grid">${playersHtml}</div>
          </div>

          ${lanChips ? `<div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; font-size:0.82rem; color:var(--text-muted);">
            <span>Mạng nội bộ phát hiện:</span> ${lanChips}
          </div>` : ""}
        </section>
      </div>
    `;

    window.LiveQR.renderSvg(document.getElementById("lobbyQrContainer"), joinUrl, 240);

    document.getElementById("btnLobbyExit").onclick = goLibrary;
    document.getElementById("btnStartGame").onclick = () => sendAction("start");
    document.getElementById("btnSim15").onclick = () => sendAction("simulate_bots", { count: 15 });
    document.getElementById("btnSim40").onclick = () => sendAction("simulate_bots", { count: 40 });
    document.getElementById("btnCopyJoinLink").onclick = async () => {
      try {
        await navigator.clipboard.writeText(joinUrl);
        toast("Đã sao chép đường dẫn phòng chơi!", "success");
      } catch (_) {
        toast(joinUrl);
      }
    };
    document.getElementById("btnEditJoinDomain").onclick = () => {
      const val = prompt("Nhập địa chỉ gốc cho mã QR (ví dụ https://lop-toan-thay-hoang.onrender.com hoặc http://192.168.1.10:8090):", getJoinBaseUrl());
      if (val !== null) {
        app.customJoinBaseUrl = val.trim();
        renderRoom();
      }
    };

    root.querySelectorAll("[data-toggle]").forEach((btn) => {
      btn.onclick = () => sendAction("toggle_setting", { key: btn.dataset.toggle });
    });
    root.querySelectorAll("[data-kick]").forEach((btn) => {
      btn.onclick = () => sendAction("kick_player", { playerId: btn.dataset.kick });
    });
    root.querySelectorAll("[data-set-base]").forEach((btn) => {
      btn.onclick = () => {
        app.customJoinBaseUrl = btn.dataset.setBase;
        renderRoom();
      };
    });
  }

  // =========================================================================
  // LIVE PROJECTOR STAGE (ANSWERING / REVIEW / LEADERBOARD / FINISHED)
  // =========================================================================
  function renderStage(st) {
    const q = st.question;
    const meta = q ? getTypeMeta(q.type) : getTypeMeta("mcq");
    const analytics = st.analytics || {};
    const totalSub = analytics.totalSubmitted || 0;
    const pctSub = st.playerCount > 0 ? Math.min(100, Math.round((totalSub / st.playerCount) * 100)) : 0;

    const qOptionsHtml = (st.questionOutline || [])
      .map(
        (item) => `<option value="${item.index}" ${item.index === st.questionIndex ? "selected" : ""}>Câu ${item.index + 1} • ${getTypeMeta(item.type).short}</option>`
      )
      .join("");

    let mainBodyHtml = "";

    if (st.phase === "finished" || st.phase === "leaderboard") {
      mainBodyHtml = renderLeaderboardView(st);
    } else if (q) {
      const remSec = app.localRemaining === null ? null : Math.ceil(app.localRemaining);
      const timerHtml =
        st.phase === "answering"
          ? `<div class="timer-badge ${remSec !== null && remSec <= 5 ? "urgent" : ""}" id="liveTimerBadge">
              ${remSec === null ? "∞ Tự do" : remSec > 0 ? `⏱ ${remSec}s` : "⏱ Hết giờ"}
            </div>`
          : `<span class="badge badge-amber" style="font-size:0.92rem; padding:7px 14px;">🔒 Đã khóa nhận bài • Chế độ Tổng hợp &amp; Giải thích</span>`;

      const showAnalytics = st.phase === "review" || st.settings.showLiveChart;

      mainBodyHtml = `
        <section class="stage-question-card">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <span class="badge badge-${meta.color}" style="font-size:0.86rem;">Câu ${st.questionIndex + 1} / ${st.totalQuestions} • ${meta.label}</span>
              ${st.revealAnswer ? `<span class="badge badge-success">✓ Đã công bố đáp án</span>` : ""}
            </div>
            ${timerHtml}
          </div>

          <div class="stage-prompt" id="stagePromptEl">${formatRichText(q.prompt)}</div>

          <div class="stage-metrics-row">
            <div style="font-weight:800; font-size:0.96rem; color:var(--primary);" id="liveSubmittedLabel">
              👥 ${totalSub} / ${st.playerCount} học sinh đã nộp (${pctSub}%)
            </div>
            <div class="progress-track">
              <div class="progress-fill" style="width:${pctSub}%;"></div>
            </div>
            ${st.phase === "review" && totalSub > 0 ? `<span class="badge badge-success" style="font-size:0.88rem;">Độ chính xác trung bình: ${analytics.avgAccuracyPct}%</span>` : ""}
          </div>
        </section>

        ${showAnalytics ? renderAnalyticsCard(q, analytics, st.revealAnswer, st.settings.showNamesOnProjector) : renderHiddenLiveCard(st, totalSub)}

        ${st.showExplanation ? renderExplanationCard(q, st.teacherNote) : ""}
      `;
    }

    root.innerHTML = `
      <div class="stage-header-bar">
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <button class="btn btn-outline btn-sm" id="btnStageExit">← Thoát</button>
          <span class="badge badge-blue" style="font-family:var(--font-mono); font-size:0.88rem;">PHÒNG: ${escapeHtml(st.code)}</span>
          <button class="btn btn-soft btn-sm" id="btnToggleMiniQr">📱 Mã QR</button>
          <select class="select" id="selJumpQ" style="width:auto; padding:6px 12px; font-size:0.86rem;">
            ${qOptionsHtml}
          </select>
        </div>

        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <button class="toggle-pill ${st.settings.scoringEnabled ? "active" : ""}" id="btnStageScoringToggle" style="padding:5px 11px;">
            <span class="toggle-dot"></span> Tính điểm
          </button>
          <button class="btn btn-outline btn-sm" id="btnOpenPlayersModal">👥 Chi tiết HS (${st.playerCount})</button>
          <a class="btn btn-outline btn-sm" href="/api/live/rooms/${encodeURIComponent(st.code)}/report.csv?token=${encodeURIComponent(app.hostToken)}">⬇ Xuất CSV</a>
          <button class="btn btn-outline btn-sm" id="btnFullscreen">⛶ Toàn màn hình</button>
        </div>
      </div>

      ${app.showMiniQr ? `
        <div class="card" style="margin-bottom:16px; display:flex; align-items:center; gap:20px; flex-wrap:wrap; background:linear-gradient(135deg,#eff6ff,#fff);">
          <div id="miniQrBox"></div>
          <div>
            <div style="font-weight:800; font-size:1.1rem;">Học sinh vào muộn có thể quét mã QR này bất cứ lúc nào</div>
            <div style="font-family:var(--font-mono); font-size:1.35rem; font-weight:800; color:var(--primary); margin:4px 0;">Mã phòng: ${escapeHtml(st.code)}</div>
            <div style="font-size:0.86rem; color:var(--text-secondary);">${escapeHtml(getJoinUrl())}</div>
          </div>
          <button class="btn btn-ghost btn-sm" style="margin-left:auto;" id="btnCloseMiniQr">Đóng ✕</button>
        </div>
      ` : ""}

      <div id="stageContentRoot">${mainBodyHtml}</div>

      ${renderStageDock(st)}
    `;

    renderMathIn(document.getElementById("stageContentRoot"));

    if (app.showMiniQr) {
      window.LiveQR.renderSvg(document.getElementById("miniQrBox"), getJoinUrl(), 132);
      document.getElementById("btnCloseMiniQr").onclick = () => { app.showMiniQr = false; renderRoom(); };
    }

    document.getElementById("btnStageExit").onclick = () => {
      if (confirm("Thoát khỏi phòng chơi hiện tại?")) goLibrary();
    };
    document.getElementById("btnToggleMiniQr").onclick = () => {
      app.showMiniQr = !app.showMiniQr;
      renderRoom();
    };
    document.getElementById("selJumpQ").onchange = (e) => sendAction("goto", { questionIndex: Number(e.target.value) });
    document.getElementById("btnStageScoringToggle").onclick = () => sendAction("toggle_setting", { key: "scoringEnabled" });
    document.getElementById("btnOpenPlayersModal").onclick = () => openPlayersModal(st);
    document.getElementById("btnFullscreen").onclick = () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
    };

    // Board note save handler
    const noteBtn = document.getElementById("btnSaveBoardNote");
    if (noteBtn) {
      noteBtn.onclick = () => {
        const val = document.getElementById("teacherBoardNoteInput").value;
        sendAction("set_note", { note: val });
        toast("Đã cập nhật ghi chú lên màn hình chiếu & điện thoại HS!", "success");
      };
    }

    // Dock handlers
    root.querySelectorAll("[data-act]").forEach((btn) => {
      btn.onclick = () => sendAction(btn.dataset.act);
    });
    const extBtn = document.getElementById("btnExtend15");
    if (extBtn) extBtn.onclick = () => sendAction("extend_time", { seconds: 15 });
    const liveChartBtn = document.getElementById("btnToggleLiveChart");
    if (liveChartBtn) liveChartBtn.onclick = () => sendAction("toggle_setting", { key: "showLiveChart" });
    const simMoreBtn = document.getElementById("btnStageSimBots");
    if (simMoreBtn) simMoreBtn.onclick = () => sendAction("simulate_bots", { count: 40 });
  }

  function renderHiddenLiveCard(st, totalSub) {
    return `
      <section class="analytics-card" style="text-align:center; padding:38px 24px;">
        <div style="font-size:2.4rem; margin-bottom:8px;">📡</div>
        <h3 style="margin:0 0 6px; font-size:1.2rem;">Học sinh đang trả lời trên điện thoại...</h3>
        <p style="margin:0 0 18px; color:var(--text-secondary); max-width:560px; margin-inline:auto;">
          Biểu đồ phân bố đáp án đang tạm ẩn để học sinh tự suy nghĩ độc lập, không chọn theo số đông.
          Đã nhận <strong>${totalSub} / ${st.playerCount}</strong> bài nộp.
        </p>
        <div style="display:flex; justify-content:center; gap:10px; flex-wrap:wrap;">
          <button class="btn btn-outline" id="btnToggleLiveChart">👁 Hiện biểu đồ trực tiếp</button>
          <button class="btn btn-primary" data-act="lock">🔒 Khóa nhận bài &amp; Tổng hợp ngay</button>
        </div>
      </section>
    `;
  }

  function renderAnalyticsCard(q, a, reveal, showNames) {
    let body = "";

    if (q.type === "mcq") {
      const stats = a.optionStats || [];
      body = `
        <div class="mcq-bars">
          ${stats
            .map((s, i) => {
              const col = OPT_COLORS[i % OPT_COLORS.length];
              const cls = reveal ? (s.isCorrect ? "is-correct-revealed" : "is-dimmed") : "";
              return `
                <div class="mcq-bar-row ${cls}">
                  <div class="mcq-bar-bg" style="width:${s.pct}%; background:${reveal && s.isCorrect ? "#059669" : col};"></div>
                  <div class="mcq-bar-content">
                    <div class="mcq-bar-left">
                      <span class="opt-letter-badge" style="background:${reveal && s.isCorrect ? "#059669" : col};">${s.label}</span>
                      <div>${formatRichText(s.text)}</div>
                    </div>
                    <div class="mcq-bar-stat">
                      ${reveal && s.isCorrect ? '<span class="badge badge-success">✓ ĐÁP ÁN ĐÚNG</span>' : ""}
                      <span>${s.count} HS</span>
                      <span style="color:var(--text-muted); font-size:0.95rem;">(${s.pct}%)</span>
                    </div>
                  </div>
                </div>
              `;
            })
            .join("")}
        </div>
      `;
    } else if (q.type === "true_false") {
      const stats = a.statementStats || [];
      body = stats
        .map((s) => {
          const tPct = s.truePct || 0;
          const fPct = s.falsePct || 0;
          return `
            <div class="tf-stat-row">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
                <div style="font-size:1.05rem; font-weight:600;">
                  ${s.label ? `<strong style="color:var(--purple); margin-right:6px;">${s.label}</strong>` : ""}
                  ${s.text ? formatRichText(s.text) : "Nhận định của câu hỏi"}
                </div>
                <div style="display:flex; gap:8px; align-items:center;">
                  ${reveal ? `<span class="badge ${s.correctAnswer ? "badge-success" : "badge-rose"}">Đáp án: ${s.correctAnswer ? "ĐÚNG" : "SAI"}</span>` : ""}
                  ${reveal ? `<span class="badge badge-blue">Đúng: ${s.accuracyPct}% lớp</span>` : ""}
                </div>
              </div>
              <div class="tf-stacked-bar">
                <div class="tf-seg-true" style="width:${tPct || (fPct === 0 ? 50 : 0)}%; opacity:${s.trueCount ? 1 : 0.25};">
                  ĐÚNG: ${s.trueCount} (${tPct}%)
                </div>
                <div class="tf-seg-false" style="width:${fPct || (tPct === 0 ? 50 : 0)}%; opacity:${s.falseCount ? 1 : 0.25};">
                  SAI: ${s.falseCount} (${fPct}%)
                </div>
              </div>
            </div>
          `;
        })
        .join("");
    } else if (q.type === "short_answer") {
      const groups = a.groups || [];
      body = `
        ${reveal ? `
          <div style="margin-bottom:14px; padding:12px 16px; border-radius:12px; background:var(--success-soft); border:1.5px solid var(--success);">
            <strong>✓ Đáp án chuẩn:</strong> ${(a.acceptedAnswers || []).map((x) => `<span class="badge badge-success" style="margin-left:6px; font-size:0.95rem;">${escapeHtml(x)}</span>`).join("")}
          </div>
        ` : ""}
        <div class="answer-cloud">
          ${groups.length
            ? groups
                .map((g) => {
                  const cls = reveal ? (g.isCorrect ? "is-correct" : "is-wrong") : "";
                  return `
                    <div class="cloud-chip ${cls}">
                      <span>${escapeHtml(g.label)}</span>
                      <span class="cloud-count">${g.count} HS (${g.pct}%)</span>
                    </div>
                  `;
                })
                .join("")
            : '<div style="color:var(--text-muted);">Chưa có câu trả lời nào được nộp.</div>'}
        </div>
      `;
    } else if (q.type === "fill_blank") {
      const blanks = a.blankStats || [];
      let renderedTpl = formatRichText(a.template || "");
      blanks.forEach((b) => {
        const display = reveal ? escapeHtml((b.accepted || [""])[0]) : `Ô #${b.index + 1}`;
        const pill = `<span class="badge ${reveal ? "badge-success" : "badge-amber"}" style="font-size:1rem; padding:4px 12px; margin:0 4px;">${display} (${b.accuracyPct}% đúng)</span>`;
        renderedTpl = renderedTpl.replace(`{{${b.index}}}`, pill);
      });
      body = `
        <div style="font-size:1.18rem; line-height:2.1; padding:16px 20px; border-radius:14px; background:var(--surface-subtle); border:1.5px solid var(--border); margin-bottom:16px;">
          ${renderedTpl}
        </div>
        <div class="form-grid-2">
          ${blanks
            .map(
              (b) => `
              <div class="tf-stat-row" style="margin:0;">
                <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                  <strong>Chỗ trống #${b.index + 1}</strong>
                  <span class="badge badge-blue">${b.accuracyPct}% trả lời đúng</span>
                </div>
                <div style="display:flex; flex-wrap:wrap; gap:6px;">
                  ${(b.topAnswers || [])
                    .map(
                      (ta) => `<span class="badge ${reveal ? (ta.isCorrect ? "badge-success" : "badge-rose") : "badge-amber"}">${escapeHtml(ta.text)} × ${ta.count}</span>`
                    )
                    .join("") || '<span style="color:var(--text-muted); font-size:0.86rem;">Chưa có dữ liệu</span>'}
                </div>
              </div>
            `
            )
            .join("")}
        </div>
      `;
    } else if (q.type === "drag_order") {
      const posStats = a.positionStats || [];
      const topSeqs = a.topSequences || [];
      body = `
        <div style="margin-bottom:14px; display:flex; gap:10px; flex-wrap:wrap;">
          <span class="badge badge-success" style="font-size:0.9rem;">Xếp đúng toàn bộ thứ tự: ${a.fullCorrectCount || 0} HS (${a.fullCorrectPct || 0}%)</span>
        </div>
        <div class="mcq-bars" style="margin-bottom:16px;">
          ${posStats
            .map(
              (ps) => `
              <div class="mcq-bar-row ${reveal ? "is-correct-revealed" : ""}">
                <div class="mcq-bar-bg" style="width:${ps.accuracyPct}%; background:#4338ca;"></div>
                <div class="mcq-bar-content">
                  <div class="mcq-bar-left">
                    <span class="opt-letter-badge" style="background:#4338ca;">#${ps.slot}</span>
                    <div>${reveal ? formatRichText(ps.correctText) : `Vị trí thứ ${ps.slot} (Bấm "Hiện đáp án" để công bố)`}</div>
                  </div>
                  <div class="mcq-bar-stat">
                    <span>${ps.accuracyPct}% chọn đúng vị trí</span>
                  </div>
                </div>
              </div>
            `
            )
            .join("")}
        </div>
        ${topSeqs.length ? `
          <div style="font-size:0.88rem; color:var(--text-secondary);">
            <strong>Các thứ tự học sinh hay xếp nhất:</strong>
            <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:6px;">
              ${topSeqs
                .map(
                  (sq) => `<span class="badge ${reveal ? (sq.isCorrect ? "badge-success" : "badge-amber") : "badge-blue"}">${sq.labels.join(" → ")} : ${sq.count} HS (${sq.pct}%)</span>`
                )
                .join("")}
            </div>
          </div>
        ` : ""}
      `;
    } else if (q.type === "drag_match") {
      const pairStats = a.pairStats || [];
      body = `
        <div style="margin-bottom:14px;">
          <span class="badge badge-success" style="font-size:0.9rem;">Ghép đúng tất cả các cặp: ${a.fullCorrectCount || 0} HS (${a.fullCorrectPct || 0}%)</span>
        </div>
        <div class="mcq-bars">
          ${pairStats
            .map(
              (ps) => `
              <div class="mcq-bar-row ${reveal ? "is-correct-revealed" : ""}">
                <div class="mcq-bar-bg" style="width:${ps.accuracyPct}%; background:#059669;"></div>
                <div class="mcq-bar-content" style="flex-wrap:wrap;">
                  <div class="mcq-bar-left">
                    <span>${formatRichText(ps.left)}</span>
                    <span style="color:var(--primary); font-weight:800;">⇄</span>
                    <span>${reveal ? formatRichText(ps.correctRight) : "???"}</span>
                  </div>
                  <div class="mcq-bar-stat">
                    <span class="badge ${ps.accuracyPct >= 70 ? "badge-success" : "badge-amber"}">${ps.accuracyPct}% ghép đúng</span>
                  </div>
                </div>
                ${ps.wrongMatches && ps.wrongMatches.length ? `
                  <div style="position:relative; z-index:1; margin-top:6px; font-size:0.84rem; color:var(--danger);">
                    Hay ghép nhầm với: ${ps.wrongMatches.map((w) => `<strong>${formatRichText(w.rightText)}</strong> (${w.count} HS)`).join(", ")}
                  </div>
                ` : ""}
              </div>
            `
            )
            .join("")}
        </div>
      `;
    }

    return `
      <section class="analytics-card">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; flex-wrap:wrap; gap:8px;">
          <h3 style="margin:0; font-size:1.06rem;">📊 Tổng hợp câu trả lời của cả lớp</h3>
          <span style="font-size:0.84rem; color:var(--text-muted);">Thời gian phản hồi TB: ${((a.avgResponseMs || 0) / 1000).toFixed(1)}s</span>
        </div>
        ${body}
      </section>
    `;
  }

  function renderExplanationCard(q, teacherNote) {
    return `
      <section class="explanation-card">
        <div class="explanation-title">
          <span>💡</span>
          <span>Giải thích ý nghĩa &amp; Điểm cần lưu ý cho cả lớp</span>
        </div>
        <div class="explanation-body">
          ${q.explanation ? formatRichText(q.explanation) : '<em style="color:var(--text-secondary);">Câu hỏi này chưa có nội dung giải thích sẵn. Thầy/cô có thể nhập ghi chú nhanh bên dưới để chiếu lên màn hình!</em>'}
        </div>
        ${teacherNote ? `
          <div style="margin-top:14px; padding:12px 16px; border-radius:12px; background:#fff; border:1.5px solid #93c5fd;">
            <strong style="color:var(--primary);">📝 Ghi chú trực tiếp của giáo viên:</strong>
            <div style="margin-top:4px;">${formatRichText(teacherNote)}</div>
          </div>
        ` : ""}
        <div style="display:flex; gap:8px; margin-top:14px;">
          <input id="teacherBoardNoteInput" class="input" value="${escapeHtml(teacherNote || "")}" placeholder="Gõ thêm ghi chú ngắn hoặc nhắc nhở lỗi sai để hiện ngay trên bảng & điện thoại HS..." />
          <button class="btn btn-primary btn-sm" id="btnSaveBoardNote">Ghim lên bảng</button>
        </div>
      </section>
    `;
  }

  function renderLeaderboardView(st) {
    const lb = st.leaderboard || [];
    const top3 = lb.slice(0, 3);
    const isEnd = st.phase === "finished";
    const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean);
    const medals = { 1: "🥇", 2: "🥈", 3: "🥉" };

    return `
      <section class="analytics-card" style="text-align:center;">
        <span class="badge ${isEnd ? "badge-success" : "badge-purple"}" style="font-size:0.9rem;">
          ${isEnd ? "🏆 KẾT THÚC BUỔI TƯƠNG TÁC" : "📊 BẢNG XẾP HẠNG HIỆN TẠI"}
        </span>
        <h2 style="margin:10px 0 4px; font-size:1.6rem;">${escapeHtml(st.setTitle)}</h2>
        <p style="margin:0; color:var(--text-secondary);">${st.playerCount} học sinh tham gia • ${st.totalQuestions} câu hỏi</p>

        ${st.settings.scoringEnabled ? `
          <div class="podium-row">
            ${podiumOrder
              .map(
                (p) => `
                <div class="podium-slot rank-${p.rank}">
                  <div style="font-size:2.1rem;">${medals[p.rank] || ""} ${escapeHtml(p.avatar)}</div>
                  <div style="font-weight:800; font-size:1.05rem; margin-top:6px;">${escapeHtml(p.name)}</div>
                  ${p.className ? `<div style="font-size:0.8rem; color:var(--text-muted);">${escapeHtml(p.className)}</div>` : ""}
                  <div style="font-family:var(--font-mono); font-size:1.3rem; font-weight:800; color:var(--primary); margin-top:8px;">${p.score.toLocaleString("vi-VN")} đ</div>
                  <div style="font-size:0.8rem; color:var(--success); font-weight:700;">Đúng trọn vẹn ${p.correctCount} câu</div>
                </div>
              `
              )
              .join("")}
          </div>

          <div style="overflow-x:auto; text-align:left;">
            <table class="lb-table">
              <thead>
                <tr>
                  <th>Hạng</th>
                  <th>Học sinh</th>
                  <th>Lớp</th>
                  <th>Số câu đúng</th>
                  <th>Tổng điểm</th>
                </tr>
              </thead>
              <tbody>
                ${lb
                  .map(
                    (p) => `
                    <tr>
                      <td style="font-weight:800;">#${p.rank}</td>
                      <td style="font-weight:700;">${escapeHtml(p.avatar)} ${escapeHtml(p.name)}</td>
                      <td>${escapeHtml(p.className || "-")}</td>
                      <td>${p.correctCount} / ${st.totalQuestions}</td>
                      <td style="font-family:var(--font-mono); font-weight:800; color:var(--primary);">${p.score.toLocaleString("vi-VN")}</td>
                    </tr>
                  `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        ` : `
          <div style="padding:30px 16px; color:var(--text-secondary);">
            Chế độ tính điểm đang tắt (Chế độ giảng dạy thuần tương tác). Thầy/cô có thể tải file CSV để xem thống kê chi tiết từng câu của cả lớp!
          </div>
        `}
      </section>
    `;
  }

  function renderStageDock(st) {
    const isLast = st.questionIndex >= st.totalQuestions - 1;
    let controls = "";

    if (st.phase === "answering") {
      controls = `
        <button class="btn btn-dock" id="btnExtend15">+15 giây</button>
        <button class="btn btn-dock ${st.settings.showLiveChart ? "active" : ""}" id="btnToggleLiveChart">
          ${st.settings.showLiveChart ? "🙈 Ẩn biểu đồ" : "📊 Hiện biểu đồ"}
        </button>
        ${st.playerCount === 0 ? `<button class="btn btn-dock" id="btnStageSimBots">🤖 +40 HS ảo</button>` : ""}
        <button class="btn btn-warning" data-act="lock">🔒 Khóa bài &amp; Tổng hợp (L)</button>
      `;
    } else if (st.phase === "review") {
      controls = `
        <button class="btn btn-dock" data-act="reopen">↺ Mở lại nhận bài</button>
        <button class="btn ${st.revealAnswer ? "btn-success" : "btn-primary"}" data-act="reveal">
          ${st.revealAnswer ? "✓ Đang hiện Đáp án (R)" : "🎯 Hiện Đáp án đúng (R)"}
        </button>
        <button class="btn ${st.showExplanation ? "btn-purple" : "btn-dock"}" data-act="toggle_explanation">
          ${st.showExplanation ? "💡 Đang hiện Giải thích (E)" : "💡 Mở Giải thích (E)"}
        </button>
        ${st.settings.scoringEnabled ? `<button class="btn btn-dock" data-act="show_leaderboard">🏆 Bảng xếp hạng</button>` : ""}
        <button class="btn btn-success" data-act="next">${isLast ? "🏁 Kết thúc buổi chơi →" : "Câu tiếp theo →"}</button>
      `;
    } else if (st.phase === "leaderboard") {
      controls = `
        <button class="btn btn-dock" data-act="show_leaderboard">← Quay lại biểu đồ</button>
        <button class="btn btn-success" data-act="next">${isLast ? "🏁 Tổng kết buổi chơi →" : "Câu tiếp theo →"}</button>
      `;
    } else if (st.phase === "finished") {
      controls = `
        <button class="btn btn-dock" data-act="start">↺ Chơi lại từ Câu 1</button>
        <a class="btn btn-success" href="/api/live/rooms/${encodeURIComponent(st.code)}/report.csv?token=${encodeURIComponent(app.hostToken)}">⬇ Tải báo cáo kết quả CSV</a>
      `;
    }

    return `
      <div class="stage-dock">
        <div style="font-size:0.84rem; opacity:0.85;">
          Phím tắt: <strong>L</strong> Khóa • <strong>R</strong> Đáp án • <strong>E</strong> Giải thích • <strong>→</strong> Câu tiếp
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          ${controls}
        </div>
      </div>
    `;
  }

  function openPlayersModal(st) {
    const rows = (st.players || [])
      .map(
        (p) => `
        <tr>
          <td style="font-weight:700;">${escapeHtml(p.avatar)} ${escapeHtml(p.name)}</td>
          <td>${escapeHtml(p.className || "-")}</td>
          <td>${p.submitted ? '<span class="badge badge-success">Đã nộp</span>' : '<span class="badge badge-amber">Chưa nộp</span>'}</td>
          <td>${p.accuracy !== null ? `${Math.round(p.accuracy * 100)}%` : "-"}</td>
          <td style="font-family:var(--font-mono); font-weight:700;">${p.score}</td>
        </tr>
      `
      )
      .join("");

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="playersBackdrop">
        <div class="modal-box" style="max-width:760px;">
          <div class="modal-head">
            <h3 style="margin:0;">👥 Chi tiết học sinh (${st.playerCount})</h3>
            <button class="btn btn-ghost btn-sm" id="btnClosePlayers">✕</button>
          </div>
          <div style="overflow-x:auto;">
            <table class="lb-table">
              <thead><tr><th>Họ tên</th><th>Lớp</th><th>Câu hiện tại</th><th>Độ đúng</th><th>Điểm</th></tr></thead>
              <tbody>${rows || '<tr><td colspan="5" style="text-align:center;">Chưa có học sinh nào.</td></tr>'}</tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    const close = () => { modalRoot.innerHTML = ""; };
    document.getElementById("btnClosePlayers").onclick = close;
    document.getElementById("playersBackdrop").onclick = (e) => { if (e.target.id === "playersBackdrop") close(); };
  }

  init();
})();
