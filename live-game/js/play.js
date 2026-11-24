/**
 * Edu Live Game — Student Mobile Interactive Web App
 * Supports QR auto-join, SSE real-time sync, and all 6 interactive question types
 * (MCQ, True/False 1 or 4 statements, Short Answer, Fill-in-the-Blank Cloze,
 *  Touch Drag-and-Drop Ordering, and Drag/Tap Matching Pairs).
 */
(function () {
  "use strict";

  const { escapeHtml, formatRichText, renderMathIn, getTypeMeta } = window.LiveMath;

  const root = document.getElementById("playRoot");
  const toastContainer = document.getElementById("toastContainer");

  const AVATARS = ["🦊", "🐼", "🦁", "🐨", "🐸", "🦄", "🐙", "🐝", "🦋", "🐢", "🐬", "🦉"];
  const OPT_COLORS = ["#2563eb", "#0d9488", "#d97706", "#9333ea"];
  const MATCH_COLORS = ["#2563eb", "#059669", "#d97706", "#9333ea", "#e11d48", "#0891b2"];

  // Extract room code from URL path (/play/AB12CD) or query (?code=AB12CD)
  function detectInitialRoomCode() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("code")) return params.get("code").trim().toUpperCase();
    const parts = window.location.pathname.split("/").filter(Boolean);
    const playIdx = parts.indexOf("play");
    if (playIdx >= 0 && parts[playIdx + 1] && parts[playIdx + 1].toLowerCase() !== "play.html") {
      return parts[playIdx + 1].trim().toUpperCase();
    }
    return "";
  }

  const state = {
    roomCode: detectInitialRoomCode(),
    playerId: null,
    playerName: localStorage.getItem("eduLive_name") || "",
    className: localStorage.getItem("eduLive_class") || "",
    avatar: localStorage.getItem("eduLive_avatar") || AVATARS[0],
    room: null,
    sse: null,
    pollTimer: null,
    tickTimer: null,
    localRemaining: null,
    // Draft interactive answer state per questionId
    draftQId: null,
    draft: null,
    editingAfterSubmit: false,
    // Match picking state
    pickedLeftIdx: null,
    activeBlankIdx: 0,
  };

  function toast(msg, type = "info") {
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = msg;
    toastContainer.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  async function api(url, opts = {}) {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
      ...opts,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Lỗi kết nối (${res.status})`);
    return data;
  }

  // =========================================================================
  // INIT & AUTO-RECONNECT
  // =========================================================================
  async function init() {
    // Try restoring saved session for this roomCode
    if (state.roomCode) {
      const savedPid = sessionStorage.getItem(`eduLive_pid_${state.roomCode}`);
      if (savedPid) {
        try {
          const st = await api(`/api/live/rooms/${encodeURIComponent(state.roomCode)}/player?playerId=${encodeURIComponent(savedPid)}`);
          if (st.me) {
            state.playerId = savedPid;
            applyRoomState(st);
            connectStream();
            return;
          }
        } catch (_) {
          sessionStorage.removeItem(`eduLive_pid_${state.roomCode}`);
        }
      }
    }
    renderJoinScreen();

    // Resync instantly when student unlocks phone or switches back to browser tab
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && state.playerId && state.roomCode) {
        fetchLatestPlayerState();
      }
    });
  }

  function disconnectStreams() {
    if (state.sse) { state.sse.close(); state.sse = null; }
    if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
    if (state.tickTimer) { clearInterval(state.tickTimer); state.tickTimer = null; }
  }

  async function fetchLatestPlayerState() {
    if (!state.roomCode || !state.playerId) return;
    try {
      const st = await api(`/api/live/rooms/${encodeURIComponent(state.roomCode)}/player?playerId=${encodeURIComponent(state.playerId)}`);
      if (!state.room || st.version !== state.room.version) {
        applyRoomState(st);
      }
    } catch (_) {}
  }

  function connectStream() {
    disconnectStreams();
    const url = `/api/live/rooms/${encodeURIComponent(state.roomCode)}/events?role=player&playerId=${encodeURIComponent(state.playerId)}`;
    const es = new EventSource(url);
    es.addEventListener("state", (ev) => {
      try {
        applyRoomState(JSON.parse(ev.data));
      } catch (_) {}
    });
    state.sse = es;

    state.pollTimer = setInterval(fetchLatestPlayerState, 3200);

    state.tickTimer = setInterval(() => {
      if (!state.room || state.room.phase !== "answering" || state.localRemaining === null) return;
      state.localRemaining = Math.max(0, +(state.localRemaining - 0.5).toFixed(1));
      const el = document.getElementById("studentTimerPill");
      if (el) {
        const sec = Math.ceil(state.localRemaining);
        el.textContent = sec > 0 ? `⏱ ${sec}s` : "⏱ Hết giờ";
        el.className = `badge ${sec <= 5 ? "badge-rose" : "badge-blue"}`;
      }
    }, 500);
  }

  function initDraftForQuestion(q) {
    if (!q) return;
    if (state.draftQId === q.id && state.draft) return;
    state.draftQId = q.id;
    state.editingAfterSubmit = false;
    state.pickedLeftIdx = null;
    state.activeBlankIdx = 0;

    if (q.type === "mcq") {
      state.draft = { choice: null };
    } else if (q.type === "true_false") {
      const n = (q.data.statements || []).length;
      state.draft = { answers: Array(n).fill(null) };
    } else if (q.type === "short_answer") {
      state.draft = { text: "" };
    } else if (q.type === "fill_blank") {
      const n = q.data.blankCount || (q.data.blanks ? q.data.blanks.length : 1);
      state.draft = { blanks: Array(n).fill("") };
    } else if (q.type === "drag_order") {
      const items = q.data.shuffledItems || [];
      state.draft = { order: items.map((it) => it.id) };
    } else if (q.type === "drag_match") {
      const n = (q.data.leftItems || []).length;
      state.draft = { matches: Array(n).fill(null) };
    }
  }

  function applyRoomState(next) {
    const prevQId = state.room && state.room.question ? state.room.question.id : null;
    const prevPhase = state.room ? state.room.phase : null;
    const prevReveal = state.room ? state.room.revealAnswer : false;
    const prevExpl = state.room ? state.room.showExplanation : false;
    const prevNote = state.room ? state.room.teacherNote : "";
    const prevSub = state.room && state.room.mySubmission ? true : false;

    state.room = next;
    state.localRemaining = next.remainingSeconds;

    if (next.question) {
      initDraftForQuestion(next.question);
    }

    // Avoid wiping out an active text input if only submittedCount changed!
    const nextQId = next.question ? next.question.id : null;
    const nextSub = next.mySubmission ? true : false;
    const structuralChange =
      prevQId !== nextQId ||
      prevPhase !== next.phase ||
      prevReveal !== next.revealAnswer ||
      prevExpl !== next.showExplanation ||
      prevNote !== next.teacherNote ||
      prevSub !== nextSub;

    if (!structuralChange && prevPhase === "answering" && !nextSub) {
      const cntEl = document.getElementById("studentSubCount");
      if (cntEl) cntEl.textContent = `${next.submittedCount}/${next.playerCount} đã nộp`;
      return;
    }

    renderRoomView();
  }

  // =========================================================================
  // SCREEN 1: JOIN ROOM (SCANNED FROM QR CODE)
  // =========================================================================
  function renderJoinScreen() {
    root.innerHTML = `
      <section class="student-join-card">
        <div style="text-align:center; margin-bottom:18px;">
          <div class="lg-brand-icon" style="margin:0 auto 12px; width:52px; height:52px; border-radius:16px;">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
            </svg>
          </div>
          <h1 style="margin:0 0 4px; font-size:1.38rem; font-weight:800;">Tham Gia Phòng Chơi</h1>
          <p style="margin:0; font-size:0.88rem; color:var(--text-secondary);">Lớp toán thầy Hoàng • Tương tác trực tiếp</p>
        </div>

        <form id="joinForm">
          <div style="margin-bottom:12px;">
            <label class="field-label">Mã phòng (6 ký tự)</label>
            <input id="inpRoomCode" class="input" value="${escapeHtml(state.roomCode)}" placeholder="VD: AB12CD" maxlength="10" required style="font-family:var(--font-mono); font-size:1.2rem; font-weight:800; letter-spacing:0.14em; text-transform:uppercase; text-align:center;" />
          </div>

          <div style="margin-bottom:12px;">
            <label class="field-label">Họ và tên của em *</label>
            <input id="inpStudentName" class="input" value="${escapeHtml(state.playerName)}" placeholder="Ví dụ: Nguyễn Minh Anh" maxlength="40" required autocomplete="name" />
          </div>

          <div style="margin-bottom:12px;">
            <label class="field-label">Lớp (tùy chọn)</label>
            <input id="inpStudentClass" class="input" value="${escapeHtml(state.className)}" placeholder="Ví dụ: 12A1" maxlength="20" />
          </div>

          <label class="field-label" style="text-align:center;">Chọn biểu tượng của em</label>
          <div class="avatar-picker" id="avatarPicker">
            ${AVATARS.map((av) => `<button type="button" class="avatar-opt ${av === state.avatar ? "selected" : ""}" data-av="${av}">${av}</button>`).join("")}
          </div>

          <div id="joinError" style="color:var(--danger); font-size:0.88rem; font-weight:600; margin-bottom:10px; text-align:center;"></div>

          <button type="submit" class="btn btn-primary btn-lg" style="width:100%;" id="btnJoinSubmit">
            🚀 Vào phòng chơi ngay
          </button>
        </form>
      </section>
    `;

    root.querySelectorAll("[data-av]").forEach((btn) => {
      btn.onclick = () => {
        state.avatar = btn.dataset.av;
        root.querySelectorAll("[data-av]").forEach((b) => b.classList.toggle("selected", b === btn));
      };
    });

    document.getElementById("joinForm").onsubmit = async (e) => {
      e.preventDefault();
      const code = document.getElementById("inpRoomCode").value.trim().toUpperCase();
      const name = document.getElementById("inpStudentName").value.trim();
      const cls = document.getElementById("inpStudentClass").value.trim();
      const errEl = document.getElementById("joinError");
      const btn = document.getElementById("btnJoinSubmit");
      errEl.textContent = "";

      if (!code || !name) {
        errEl.textContent = "Vui lòng nhập đầy đủ mã phòng và họ tên.";
        return;
      }

      btn.disabled = true;
      btn.textContent = "Đang kết nối vào phòng...";
      try {
        const res = await api(`/api/live/rooms/${encodeURIComponent(code)}/join`, {
          method: "POST",
          body: JSON.stringify({ name, className: cls, avatar: state.avatar }),
        });
        state.roomCode = code;
        state.playerId = res.playerId;
        state.playerName = name;
        state.className = cls;
        localStorage.setItem("eduLive_name", name);
        localStorage.setItem("eduLive_class", cls);
        localStorage.setItem("eduLive_avatar", state.avatar);
        sessionStorage.setItem(`eduLive_pid_${code}`, res.playerId);
        applyRoomState(res.state);
        connectStream();
      } catch (err) {
        errEl.textContent = err.message;
        btn.disabled = false;
        btn.textContent = "🚀 Vào phòng chơi ngay";
      }
    };
  }

  // =========================================================================
  // SCREEN 2: IN-ROOM STUDENT VIEWS
  // =========================================================================
  function renderRoomView() {
    const r = state.room;
    if (!r) return;
    if (!r.me) {
      disconnectStreams();
      toast("Em đã rời khỏi phòng chơi.", "error");
      renderJoinScreen();
      return;
    }

    const hudHtml = `
      <header class="student-hud">
        <div style="display:flex; align-items:center; gap:9px; min-width:0;">
          <span style="font-size:1.5rem;">${escapeHtml(r.me.avatar)}</span>
          <div style="min-width:0;">
            <div style="font-weight:800; font-size:0.94rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(r.me.name)}</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">Phòng ${escapeHtml(r.code)} ${r.me.className ? `• ${escapeHtml(r.me.className)}` : ""}</div>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
          ${r.scoringEnabled ? `<span class="badge badge-blue" style="font-family:var(--font-mono);">${r.me.score.toLocaleString("vi-VN")} đ</span>` : ""}
          ${r.phase === "answering" && state.localRemaining !== null ? `<span class="badge ${Math.ceil(state.localRemaining) <= 5 ? "badge-rose" : "badge-blue"}" id="studentTimerPill">⏱ ${Math.ceil(state.localRemaining)}s</span>` : ""}
        </div>
      </header>
    `;

    let bodyHtml = "";

    if (r.phase === "lobby") {
      bodyHtml = `
        <section class="student-q-card" style="text-align:center; padding:34px 20px; margin:auto 0;">
          <div style="font-size:3rem; margin-bottom:10px;">${escapeHtml(r.me.avatar)}</div>
          <span class="badge badge-success" style="margin-bottom:10px;">✓ Đã vào phòng thành công!</span>
          <h2 style="margin:6px 0 8px; font-size:1.3rem;">${escapeHtml(r.setTitle)}</h2>
          <p style="margin:0 0 18px; color:var(--text-secondary); font-size:0.94rem;">
            Hãy hướng mắt lên màn hình chính của thầy/cô. Câu hỏi sẽ tự động hiện lên điện thoại của em khi thầy/cô bấm Bắt đầu!
          </p>
          <div class="badge badge-blue" style="font-size:0.9rem;">👥 Hiện có ${r.playerCount} bạn trong phòng</div>
        </section>
      `;
    } else if (r.phase === "finished") {
      bodyHtml = renderStudentFinished(r);
    } else if (r.phase === "leaderboard") {
      bodyHtml = renderStudentLeaderboard(r);
    } else if (r.question) {
      const q = r.question;
      const meta = getTypeMeta(q.type);
      const hasSubmitted = Boolean(r.mySubmission && r.mySubmission.submitted);
      const canAnswer = r.phase === "answering" && (!hasSubmitted || (r.allowChangeAnswer && state.editingAfterSubmit));

      bodyHtml = `
        <section class="student-q-card">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;">
            <span class="badge badge-${meta.color}">Câu ${r.questionIndex + 1}/${r.totalQuestions} • ${meta.short}</span>
            <span style="font-size:0.78rem; color:var(--text-muted); font-weight:600;" id="studentSubCount">${r.submittedCount}/${r.playerCount} đã nộp</span>
          </div>
          <div class="student-prompt">${formatRichText(q.prompt)}</div>
        </section>

        ${canAnswer ? renderInteractiveWidget(q) : renderPostSubmitOrReview(r, q)}
      `;
    }

    root.innerHTML = hudHtml + `<div id="studentBodyRoot" style="flex:1; display:flex; flex-direction:column;">${bodyHtml}</div>`;
    renderMathIn(document.getElementById("studentBodyRoot"));
    bindInteractiveHandlers();
  }

  // =========================================================================
  // INTERACTIVE WIDGETS FOR ALL 6 QUESTION TYPES
  // =========================================================================
  function renderInteractiveWidget(q) {
    let widget = "";

    if (q.type === "mcq") {
      const opts = q.data.options || [];
      widget = `
        <div class="student-mcq-grid" style="margin-bottom:14px;">
          ${opts
            .map(
              (opt, i) => `
              <button type="button" class="student-mcq-btn ${state.draft.choice === i ? "selected" : ""}" data-mcq-pick="${i}">
                <span class="opt-letter-badge" style="background:${OPT_COLORS[i % OPT_COLORS.length]};">${String.fromCharCode(65 + i)}</span>
                <span style="flex:1;">${formatRichText(opt)}</span>
              </button>
            `
            )
            .join("")}
        </div>
      `;
    } else if (q.type === "true_false") {
      const stmts = q.data.statements || [];
      if (stmts.length === 1 && !stmts[0].text) {
        const val = state.draft.answers[0];
        widget = `
          <div class="tf-big-grid" style="margin-bottom:14px;">
            <button type="button" class="tf-big-btn true-btn ${val === true ? "selected" : ""}" data-tf-pick="0" data-tf-val="true">✓ ĐÚNG</button>
            <button type="button" class="tf-big-btn false-btn ${val === false ? "selected" : ""}" data-tf-pick="0" data-tf-val="false">✕ SAI</button>
          </div>
        `;
      } else {
        widget = `
          <div style="margin-bottom:14px;">
            ${stmts
              .map((st, i) => {
                const val = state.draft.answers[i];
                return `
                  <div class="tf-multi-row">
                    <div style="font-weight:600; font-size:0.96rem;">
                      <strong style="color:var(--purple);">${String.fromCharCode(97 + i)})</strong> ${formatRichText(st.text)}
                    </div>
                    <div class="tf-pill-pair">
                      <button type="button" class="tf-pill-btn ${val === true ? "active-true" : ""}" data-tf-pick="${i}" data-tf-val="true">✓ Đúng</button>
                      <button type="button" class="tf-pill-btn ${val === false ? "active-false" : ""}" data-tf-pick="${i}" data-tf-val="false">✕ Sai</button>
                    </div>
                  </div>
                `;
              })
              .join("")}
          </div>
        `;
      }
    } else if (q.type === "short_answer") {
      widget = `
        <div class="card" style="margin-bottom:14px;">
          <label class="field-label">Câu trả lời của em:</label>
          <input id="inpShortAnswer" class="input" style="font-size:1.15rem; font-weight:700; padding:13px 14px;" value="${escapeHtml(state.draft.text || "")}" placeholder="${escapeHtml(q.data.placeholder || "Nhập đáp án...")}" autocomplete="off" />
        </div>
      `;
    } else if (q.type === "fill_blank") {
      const useWb = Boolean(q.data.useWordBank && q.data.wordBank && q.data.wordBank.length);
      let tplHtml = formatRichText(q.data.template || "");
      const blanks = state.draft.blanks || [];
      blanks.forEach((val, i) => {
        if (useWb) {
          const cls = `cloze-slot ${val ? "filled" : ""} ${state.activeBlankIdx === i ? "active-slot" : ""}`;
          tplHtml = tplHtml.replace(
            `{{${i}}}`,
            `<button type="button" class="${cls}" data-blank-slot="${i}">${val ? escapeHtml(val) : `Ô #${i + 1}`}</button>`
          );
        } else {
          tplHtml = tplHtml.replace(
            `{{${i}}}`,
            `<input type="text" class="input" data-blank-input="${i}" value="${escapeHtml(val)}" placeholder="Ô #${i + 1}" style="display:inline-block; width:112px; padding:4px 8px; margin:2px 4px; font-weight:700; text-align:center;" />`
          );
        }
      });

      const usedCounts = {};
      blanks.forEach((v) => { if (v) usedCounts[v] = (usedCounts[v] || 0) + 1; });

      widget = `
        <div class="cloze-sentence">${tplHtml}</div>
        ${useWb ? `
          <div style="font-size:0.82rem; font-weight:700; color:var(--text-muted); margin-bottom:8px;">
            👆 Chạm vào thẻ từ bên dưới để thả vào ô đang chọn (chạm vào ô đã điền để xóa):
          </div>
          <div class="wordbank-wrap">
            ${q.data.wordBank
              .map(
                (w) => `<button type="button" class="wordbank-chip ${usedCounts[w] ? "used" : ""}" data-wb-chip="${escapeHtml(w)}">${escapeHtml(w)}</button>`
              )
              .join("")}
          </div>
        ` : ""}
      `;
    } else if (q.type === "drag_order") {
      const lookup = {};
      (q.data.shuffledItems || []).forEach((it) => { lookup[it.id] = it.text; });
      const ord = state.draft.order || [];
      widget = `
        <div style="font-size:0.84rem; font-weight:600; color:var(--text-secondary); margin-bottom:8px;">
          ↕ Kéo thả thẻ lên/xuống hoặc bấm nút ↑ ↓ để sắp xếp đúng thứ tự từ trên xuống dưới:
        </div>
        <div class="order-list" id="studentOrderList">
          ${ord
            .map(
              (origId, pos) => `
              <div class="order-item" draggable="true" data-ord-pos="${pos}">
                <div class="order-pos-badge">${pos + 1}</div>
                <div style="flex:1; font-weight:600; font-size:0.95rem;">${formatRichText(lookup[origId] || "")}</div>
                <div class="order-arrows">
                  <button type="button" class="order-arrow-btn" data-ord-up="${pos}" ${pos === 0 ? "disabled" : ""}>▲</button>
                  <button type="button" class="order-arrow-btn" data-ord-down="${pos}" ${pos === ord.length - 1 ? "disabled" : ""}>▼</button>
                </div>
              </div>
            `
            )
            .join("")}
        </div>
      `;
    } else if (q.type === "drag_match") {
      const leftItems = q.data.leftItems || [];
      const rightItems = q.data.rightItems || [];
      const matches = state.draft.matches || [];

      // Map rightOrigId -> paired left index
      const rightToLeft = {};
      matches.forEach((rId, lIdx) => {
        if (rId !== null && rId !== undefined) rightToLeft[rId] = lIdx;
      });

      widget = `
        <div style="font-size:0.84rem; font-weight:600; color:var(--text-secondary); margin-bottom:8px;">
          🔗 Chạm 1 ô bên TRÁI rồi chạm ô tương ứng bên PHẢI để ghép cặp (hoặc kéo thả):
        </div>
        <div class="match-grid">
          <div class="match-col">
            ${leftItems
              .map((it, lIdx) => {
                const isPaired = matches[lIdx] !== null && matches[lIdx] !== undefined;
                const col = MATCH_COLORS[lIdx % MATCH_COLORS.length];
                const style = isPaired ? `border-color:${col}; background:${col}14;` : "";
                return `
                  <div class="match-card ${state.pickedLeftIdx === lIdx ? "picking" : ""}" style="${style}" draggable="true" data-match-left="${lIdx}">
                    <span>${formatRichText(it.text)}</span>
                    ${isPaired ? `<span class="match-pair-tag" style="background:${col};">${lIdx + 1}</span>` : `<span style="font-size:0.75rem; color:var(--text-muted);">#${lIdx + 1}</span>`}
                  </div>
                `;
              })
              .join("")}
          </div>
          <div class="match-col">
            ${rightItems
              .map((it) => {
                const pairedLeft = rightToLeft[it.id];
                const isPaired = pairedLeft !== undefined;
                const col = isPaired ? MATCH_COLORS[pairedLeft % MATCH_COLORS.length] : "";
                const style = isPaired ? `border-color:${col}; background:${col}14;` : "";
                return `
                  <div class="match-card" style="${style}" data-match-right="${it.id}">
                    <span>${formatRichText(it.text)}</span>
                    ${isPaired ? `<span class="match-pair-tag" style="background:${col};">${pairedLeft + 1}</span>` : ""}
                  </div>
                `;
              })
              .join("")}
          </div>
        </div>
      `;
    }

    return `
      ${widget}
      <button type="button" class="btn btn-primary btn-lg" style="width:100%; margin-top:auto;" id="btnSubmitAnswer">
        ✓ Gửi câu trả lời
      </button>
    `;
  }

  function bindInteractiveHandlers() {
    const r = state.room;
    if (!r || !r.question) return;
    const q = r.question;

    // Edit again button
    const reEditBtn = document.getElementById("btnEditSubmitted");
    if (reEditBtn) {
      reEditBtn.onclick = () => {
        state.editingAfterSubmit = true;
        renderRoomView();
      };
    }

    const submitBtn = document.getElementById("btnSubmitAnswer");
    if (!submitBtn) return;

    if (q.type === "mcq") {
      root.querySelectorAll("[data-mcq-pick]").forEach((btn) => {
        btn.onclick = () => {
          state.draft.choice = Number(btn.dataset.mcqPick);
          renderRoomView();
        };
      });
    } else if (q.type === "true_false") {
      root.querySelectorAll("[data-tf-pick]").forEach((btn) => {
        btn.onclick = () => {
          const i = Number(btn.dataset.tfPick);
          state.draft.answers[i] = btn.dataset.tfVal === "true";
          renderRoomView();
        };
      });
    } else if (q.type === "short_answer") {
      const inp = document.getElementById("inpShortAnswer");
      if (inp) {
        inp.oninput = () => { state.draft.text = inp.value; };
        inp.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); doSubmit(); } };
      }
    } else if (q.type === "fill_blank") {
      root.querySelectorAll("[data-blank-slot]").forEach((btn) => {
        btn.onclick = () => {
          const idx = Number(btn.dataset.blankSlot);
          if (state.draft.blanks[idx]) {
            state.draft.blanks[idx] = "";
            state.activeBlankIdx = idx;
          } else {
            state.activeBlankIdx = idx;
          }
          renderRoomView();
        };
      });
      root.querySelectorAll("[data-wb-chip]").forEach((btn) => {
        btn.onclick = () => {
          const word = btn.dataset.wbChip;
          let slot = state.activeBlankIdx;
          if (slot < 0 || slot >= state.draft.blanks.length) slot = 0;
          state.draft.blanks[slot] = word;
          const nextEmpty = state.draft.blanks.findIndex((v) => !v);
          state.activeBlankIdx = nextEmpty >= 0 ? nextEmpty : Math.min(slot + 1, state.draft.blanks.length - 1);
          renderRoomView();
        };
      });
      root.querySelectorAll("[data-blank-input]").forEach((inp) => {
        inp.oninput = () => { state.draft.blanks[Number(inp.dataset.blankInput)] = inp.value; };
      });
    } else if (q.type === "drag_order") {
      const swap = (a, b) => {
        const arr = state.draft.order;
        if (b < 0 || b >= arr.length) return;
        [arr[a], arr[b]] = [arr[b], arr[a]];
        renderRoomView();
      };
      root.querySelectorAll("[data-ord-up]").forEach((btn) => {
        btn.onclick = (e) => { e.stopPropagation(); swap(Number(btn.dataset.ordUp), Number(btn.dataset.ordUp) - 1); };
      });
      root.querySelectorAll("[data-ord-down]").forEach((btn) => {
        btn.onclick = (e) => { e.stopPropagation(); swap(Number(btn.dataset.ordDown), Number(btn.dataset.ordDown) + 1); };
      });

      // Desktop HTML5 drag + mobile touch drag-and-drop
      let dragSrcPos = null;
      const items = root.querySelectorAll(".order-item");
      items.forEach((el) => {
        el.addEventListener("dragstart", () => {
          dragSrcPos = Number(el.dataset.ordPos);
          el.classList.add("dragging");
        });
        el.addEventListener("dragend", () => el.classList.remove("dragging"));
        el.addEventListener("dragover", (e) => { e.preventDefault(); el.classList.add("drag-over"); });
        el.addEventListener("dragleave", () => el.classList.remove("drag-over"));
        el.addEventListener("drop", (e) => {
          e.preventDefault();
          el.classList.remove("drag-over");
          const targetPos = Number(el.dataset.ordPos);
          if (dragSrcPos !== null && dragSrcPos !== targetPos) {
            const arr = state.draft.order;
            const [moved] = arr.splice(dragSrcPos, 1);
            arr.splice(targetPos, 0, moved);
            renderRoomView();
          }
        });

        // Touch drag support for phones!
        el.addEventListener("touchstart", (e) => {
          if (e.target.closest("button")) return;
          dragSrcPos = Number(el.dataset.ordPos);
          el.classList.add("dragging");
        }, { passive: true });
        el.addEventListener("touchmove", (e) => {
          if (dragSrcPos === null) return;
          const touch = e.touches[0];
          const overEl = document.elementFromPoint(touch.clientX, touch.clientY)?.closest(".order-item");
          items.forEach((x) => x.classList.remove("drag-over"));
          if (overEl && overEl !== el) overEl.classList.add("drag-over");
        }, { passive: true });
        el.addEventListener("touchend", (e) => {
          if (dragSrcPos === null) return;
          el.classList.remove("dragging");
          const touch = e.changedTouches[0];
          const overEl = document.elementFromPoint(touch.clientX, touch.clientY)?.closest(".order-item");
          items.forEach((x) => x.classList.remove("drag-over"));
          if (overEl) {
            const targetPos = Number(overEl.dataset.ordPos);
            if (targetPos !== dragSrcPos) {
              const arr = state.draft.order;
              const [moved] = arr.splice(dragSrcPos, 1);
              arr.splice(targetPos, 0, moved);
              renderRoomView();
            }
          }
          dragSrcPos = null;
        });
      });
    } else if (q.type === "drag_match") {
      let draggedLeft = null;
      const pairUp = (lIdx, rOrigId) => {
        // Clear any existing left that used rOrigId
        state.draft.matches = state.draft.matches.map((m) => (m === rOrigId ? null : m));
        state.draft.matches[lIdx] = rOrigId;
        state.pickedLeftIdx = null;
        renderRoomView();
      };

      root.querySelectorAll("[data-match-left]").forEach((el) => {
        const lIdx = Number(el.dataset.matchLeft);
        el.onclick = () => {
          if (state.pickedLeftIdx === lIdx) {
            state.pickedLeftIdx = null;
          } else {
            state.pickedLeftIdx = lIdx;
          }
          renderRoomView();
        };
        el.addEventListener("dragstart", () => { draggedLeft = lIdx; el.classList.add("picking"); });
        el.addEventListener("dragend", () => { draggedLeft = null; el.classList.remove("picking"); });
      });

      root.querySelectorAll("[data-match-right]").forEach((el) => {
        const rId = Number(el.dataset.matchRight);
        el.onclick = () => {
          if (state.pickedLeftIdx !== null) {
            pairUp(state.pickedLeftIdx, rId);
          } else {
            // Auto-pick first unpaired left item or toast hint
            const firstUnpaired = state.draft.matches.findIndex((m) => m === null);
            if (firstUnpaired >= 0) {
              pairUp(firstUnpaired, rId);
            } else {
              toast("Hãy chạm 1 mục bên trái trước để đổi cặp ghép.");
            }
          }
        };
        el.addEventListener("dragover", (e) => { e.preventDefault(); el.classList.add("picking"); });
        el.addEventListener("dragleave", () => el.classList.remove("picking"));
        el.addEventListener("drop", (e) => {
          e.preventDefault();
          el.classList.remove("picking");
          if (draggedLeft !== null) pairUp(draggedLeft, rId);
        });
      });
    }

    submitBtn.onclick = doSubmit;
  }

  async function doSubmit() {
    const r = state.room;
    if (!r || !r.question) return;
    const q = r.question;

    // Validate completeness before submitting
    if (q.type === "mcq" && state.draft.choice === null) {
      toast("Em hãy chọn 1 phương án A, B, C hoặc D nhé!", "error");
      return;
    }
    if (q.type === "true_false" && state.draft.answers.some((v) => v === null)) {
      toast("Em hãy chọn Đúng hoặc Sai cho tất cả các ý nhé!", "error");
      return;
    }
    if (q.type === "short_answer" && !String(state.draft.text || "").trim()) {
      toast("Em hãy nhập câu trả lời trước khi gửi!", "error");
      return;
    }
    if (q.type === "fill_blank" && state.draft.blanks.some((v) => !String(v || "").trim())) {
      toast("Em hãy điền đầy đủ tất cả các chỗ trống nhé!", "error");
      return;
    }
    if (q.type === "drag_match" && state.draft.matches.some((m) => m === null)) {
      toast("Em hãy ghép đủ tất cả các cặp trước khi nộp!", "error");
      return;
    }

    const btn = document.getElementById("btnSubmitAnswer");
    if (btn) { btn.disabled = true; btn.textContent = "Đang gửi..."; }

    try {
      const res = await api(`/api/live/rooms/${encodeURIComponent(state.roomCode)}/submit`, {
        method: "POST",
        body: JSON.stringify({
          playerId: state.playerId,
          questionId: q.id,
          payload: state.draft,
        }),
      });
      state.editingAfterSubmit = false;
      toast("Đã nộp câu trả lời!", "success");
      applyRoomState(res.state);
    } catch (err) {
      toast(err.message, "error");
      if (btn) { btn.disabled = false; btn.textContent = "✓ Gửi câu trả lời"; }
    }
  }

  // =========================================================================
  // POST-SUBMIT, REVEAL & EXPLANATION ON STUDENT PHONE
  // =========================================================================
  function renderPostSubmitOrReview(r, q) {
    const sub = r.mySubmission;
    let banner = "";

    if (!r.revealAnswer) {
      banner = sub
        ? `
          <div class="feedback-banner waiting">
            <div style="font-size:2rem; margin-bottom:4px;">✅</div>
            <div style="font-weight:800; font-size:1.08rem;">Em đã gửi câu trả lời!</div>
            <div style="font-size:0.88rem; margin-top:4px;">Hãy xem biểu đồ tổng hợp trên màn hình chính và nghe thầy/cô phân tích nhé.</div>
            ${r.phase === "answering" && r.allowChangeAnswer ? `<button class="btn btn-outline btn-sm" style="margin-top:12px;" id="btnEditSubmitted">✎ Sửa lại đáp án</button>` : ""}
          </div>
        `
        : `
          <div class="feedback-banner partial">
            <div style="font-size:1.8rem; margin-bottom:4px;">🔒</div>
            <div style="font-weight:800;">Đã khóa nhận câu trả lời</div>
            <div style="font-size:0.88rem; margin-top:4px;">Em chưa kịp nộp câu này. Hãy theo dõi màn hình chính để nghe giải thích nhé!</div>
          </div>
        `;
    } else {
      if (!sub) {
        banner = `
          <div class="feedback-banner wrong">
            <div style="font-weight:800; font-size:1.05rem;">⏱ Em chưa nộp câu này</div>
          </div>
        `;
      } else if (sub.isCorrect) {
        banner = `
          <div class="feedback-banner correct">
            <div style="font-size:2.1rem;">🎉</div>
            <div style="font-weight:800; font-size:1.18rem;">Chính xác tuyệt đối!</div>
            ${r.scoringEnabled ? `<div style="font-family:var(--font-mono); font-weight:800; margin-top:4px;">+${sub.pointsEarned} điểm</div>` : ""}
          </div>
        `;
      } else if (sub.accuracy > 0) {
        banner = `
          <div class="feedback-banner partial">
            <div style="font-size:2rem;">👍</div>
            <div style="font-weight:800; font-size:1.12rem;">Đúng một phần (${Math.round(sub.accuracy * 100)}%)</div>
            ${r.scoringEnabled ? `<div style="font-family:var(--font-mono); font-weight:800; margin-top:4px;">+${sub.pointsEarned} điểm</div>` : ""}
          </div>
        `;
      } else {
        banner = `
          <div class="feedback-banner wrong">
            <div style="font-size:2rem;">💡</div>
            <div style="font-weight:800; font-size:1.12rem;">Chưa chính xác — Cùng xem giải thích nhé!</div>
          </div>
        `;
      }
    }

    let answerKeyHtml = "";
    if (r.revealAnswer && q.data) {
      if (q.type === "mcq") {
        const ci = Number(q.data.correctIndex);
        answerKeyHtml = `
          <div class="card" style="margin-bottom:12px; border-color:var(--success); background:var(--success-soft);">
            <strong style="color:var(--success);">✓ Đáp án đúng: ${String.fromCharCode(65 + ci)}</strong>
            <div style="margin-top:4px; font-weight:600;">${formatRichText((q.data.options || [])[ci] || "")}</div>
          </div>
        `;
      } else if (q.type === "true_false") {
        answerKeyHtml = `
          <div class="card" style="margin-bottom:12px;">
            <strong style="display:block; margin-bottom:8px;">✓ Đáp án chuẩn:</strong>
            ${(q.data.statements || [])
              .map(
                (st, i) => `
                <div style="display:flex; justify-content:space-between; gap:8px; padding:6px 0; border-bottom:1px solid var(--border);">
                  <span>${st.text ? `<strong>${String.fromCharCode(97 + i)})</strong> ${formatRichText(st.text)}` : "Nhận định"}</span>
                  <span class="badge ${st.answer ? "badge-success" : "badge-rose"}">${st.answer ? "ĐÚNG" : "SAI"}</span>
                </div>
              `
              )
              .join("")}
          </div>
        `;
      } else if (q.type === "short_answer") {
        answerKeyHtml = `
          <div class="card" style="margin-bottom:12px; border-color:var(--success); background:var(--success-soft);">
            <strong style="color:var(--success);">✓ Đáp án đúng:</strong>
            <span style="font-weight:800; margin-left:6px;">${escapeHtml((q.data.acceptedAnswers || [])[0] || "")}</span>
          </div>
        `;
      } else if (q.type === "fill_blank") {
        let filled = formatRichText(q.data.template || "");
        (q.data.blanks || []).forEach((b, i) => {
          filled = filled.replace(`{{${i}}}`, `<span class="badge badge-success">${escapeHtml((b.accepted || [""])[0])}</span>`);
        });
        answerKeyHtml = `<div class="card" style="margin-bottom:12px; line-height:1.9;"><strong>✓ Đáp án hoàn chỉnh:</strong><div style="margin-top:6px;">${filled}</div></div>`;
      } else if (q.type === "drag_order") {
        answerKeyHtml = `
          <div class="card" style="margin-bottom:12px;">
            <strong style="display:block; margin-bottom:8px; color:var(--success);">✓ Thứ tự đúng:</strong>
            ${(q.data.items || [])
              .map((it, i) => `<div style="padding:5px 0;"><strong>#${i + 1}.</strong> ${formatRichText(it)}</div>`)
              .join("")}
          </div>
        `;
      } else if (q.type === "drag_match") {
        answerKeyHtml = `
          <div class="card" style="margin-bottom:12px;">
            <strong style="display:block; margin-bottom:8px; color:var(--success);">✓ Các cặp ghép đúng:</strong>
            ${(q.data.pairs || [])
              .map((p) => `<div style="padding:5px 0; border-bottom:1px solid var(--border);">${formatRichText(p.left)} <strong>⇄</strong> ${formatRichText(p.right)}</div>`)
              .join("")}
          </div>
        `;
      }
    }

    const explHtml =
      (r.showExplanation || r.revealAnswer) && (q.explanation || r.teacherNote)
        ? `
          <div class="explanation-card" style="padding:16px 18px;">
            <div class="explanation-title" style="font-size:1rem;">💡 Giải thích của thầy/cô</div>
            ${q.explanation ? `<div style="font-size:0.95rem;">${formatRichText(q.explanation)}</div>` : ""}
            ${r.teacherNote ? `<div style="margin-top:10px; padding:10px 12px; background:#fff; border-radius:10px; border:1px solid #93c5fd;"><strong>📝 Ghi chú thêm:</strong> ${formatRichText(r.teacherNote)}</div>` : ""}
          </div>
        `
        : "";

    return banner + answerKeyHtml + explHtml;
  }

  function renderStudentLeaderboard(r) {
    return `
      <section class="student-q-card" style="text-align:center;">
        <span class="badge badge-purple">🏆 BẢNG XẾP HẠNG</span>
        <h2 style="margin:10px 0 4px;">Hạng của em: #${r.me.rank || "-"}</h2>
        ${r.scoringEnabled ? `<div style="font-family:var(--font-mono); font-size:1.5rem; font-weight:800; color:var(--primary);">${r.me.score.toLocaleString("vi-VN")} điểm</div>` : ""}
        <div style="margin-top:16px; text-align:left;">
          ${(r.topLeaderboard || [])
            .map(
              (p) => `
              <div style="display:flex; justify-content:space-between; padding:9px 12px; border-radius:10px; background:${p.id === r.me.id ? "var(--primary-soft)" : "var(--surface-subtle)"}; margin-bottom:6px; font-weight:700;">
                <span>#${p.rank} ${escapeHtml(p.avatar)} ${escapeHtml(p.name)}</span>
                <span style="font-family:var(--font-mono); color:var(--primary);">${p.score.toLocaleString("vi-VN")}</span>
              </div>
            `
            )
            .join("")}
        </div>
      </section>
    `;
  }

  function renderStudentFinished(r) {
    return `
      <section class="student-q-card" style="text-align:center; padding:28px 18px;">
        <div style="font-size:3rem;">🎉</div>
        <h2 style="margin:8px 0 4px;">Hoàn thành buổi tương tác!</h2>
        <p style="margin:0 0 16px; color:var(--text-secondary);">Cảm ơn ${escapeHtml(r.me.name)} đã tham gia cùng cả lớp.</p>
        ${r.scoringEnabled ? `
          <div style="display:flex; justify-content:center; gap:12px; margin-bottom:18px; flex-wrap:wrap;">
            <span class="badge badge-blue" style="font-size:1rem; padding:8px 14px;">Hạng #${r.me.rank || "-"}</span>
            <span class="badge badge-success" style="font-size:1rem; padding:8px 14px;">${r.me.score.toLocaleString("vi-VN")} điểm</span>
            <span class="badge badge-purple" style="font-size:1rem; padding:8px 14px;">Đúng trọn vẹn ${r.me.correctCount}/${r.totalQuestions} câu</span>
          </div>
        ` : `<div class="badge badge-success" style="font-size:0.96rem; padding:8px 14px;">Đúng trọn vẹn ${r.me.correctCount}/${r.totalQuestions} câu</div>`}
      </section>
    `;
  }

  init();
})();
