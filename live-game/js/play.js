/**
 * Edu Live Game — Student Mobile Interactive Web App
 * - 100% custom-drawn SVG icons & monogram avatars (zero system emojis)
 * - Instant notification when teacher exits/closes the room (phase === "closed")
 * - 10.0 -> 20.0 rank-scaled score display to 1 decimal place
 * - All 6 interactive question types
 */
(function () {
  "use strict";

  const { escapeHtml, formatRichText, renderMathIn, getTypeMeta } = window.LiveMath;
  const { icon, wireSvg, avatarBadge, AVATAR_PALETTES, GAME_MODES } = window.LiveIcons;

  const root = document.getElementById("playRoot");
  const studentModalRoot = document.getElementById("studentModalRoot");
  const toastContainer = document.getElementById("toastContainer");

  const OPT_COLORS = ["#2563eb", "#0d9488", "#d97706", "#9333ea"];
  const MATCH_COLORS = ["#2563eb", "#059669", "#d97706", "#9333ea", "#e11d48", "#0891b2"];

  function fmtScore(val) {
    const num = Number(val || 0);
    return Number.isFinite(num) ? num.toFixed(1) : "0.0";
  }

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

  const savedAvatar = localStorage.getItem("eduLive_avatar");
  const validAvatar = AVATAR_PALETTES.some((p) => p.id === savedAvatar) ? savedAvatar : AVATAR_PALETTES[0].id;

  const state = {
    roomCode: detectInitialRoomCode(),
    playerId: null,
    playerName: localStorage.getItem("eduLive_name") || "",
    className: localStorage.getItem("eduLive_class") || "",
    avatar: validAvatar,
    room: null,
    sse: null,
    pollTimer: null,
    tickTimer: null,
    localRemaining: null,
    draftQId: null,
    draft: null,
    editingAfterSubmit: false,
    pickedLeftIdx: null,
    activeBlankIdx: 0,
    peekSecretRole: false,
    sabotageArmed: false,
    selectedWire: null,
    // Mobile Fullscreen Focus Lock state
    focusGuardActive: false,
    wasFullscreen: false,
    wakeLock: null,
    hiddenLeaveTimer: null,
    kickedForLeaving: false,
  };

  function isActivePlayPhase(phase) {
    return [
      "lobby",
      "answering",
      "bridge_debate",
      "review",
      "impostor_vote",
      "impostor_vote_result",
      "leaderboard",
    ].includes(phase);
  }

  async function requestAppFullscreen() {
    const el = document.documentElement;
    try {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (el.requestFullscreen) {
          await el.requestFullscreen({ navigationUI: "hide" });
        } else if (el.webkitRequestFullscreen) {
          el.webkitRequestFullscreen();
        }
      }
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        state.wasFullscreen = true;
      }
    } catch (_) {
      // iOS Safari may restrict requestFullscreen on non-video elements
    }
    requestWakeLock();
  }

  async function exitAppFullscreen() {
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (document.webkitFullscreenElement && document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    } catch (_) {}
    releaseWakeLock();
  }

  async function requestWakeLock() {
    try {
      if ("wakeLock" in navigator && !state.wakeLock) {
        state.wakeLock = await navigator.wakeLock.request("screen");
        state.wakeLock.addEventListener("release", () => { state.wakeLock = null; });
      }
    } catch (_) {}
  }

  function releaseWakeLock() {
    if (state.wakeLock) {
      try { state.wakeLock.release(); } catch (_) {}
      state.wakeLock = null;
    }
  }

  function enableFocusGuard() {
    if (state.focusGuardActive) return;
    state.focusGuardActive = true;
    document.body.classList.add("student-focus-active");
    // Trap hardware Back button & edge-swipe back gesture
    try {
      window.history.pushState({ eduLiveGuard: 1 }, "", window.location.href);
    } catch (_) {}
  }

  function disableFocusGuard() {
    state.focusGuardActive = false;
    state.wasFullscreen = false;
    if (state.hiddenLeaveTimer) {
      clearTimeout(state.hiddenLeaveTimer);
      state.hiddenLeaveTimer = null;
    }
    document.body.classList.remove("student-focus-active");
    closeStudentModal();
    exitAppFullscreen();
  }

  function closeStudentModal() {
    if (studentModalRoot) studentModalRoot.innerHTML = "";
  }

  function openLeaveConfirmModal(reasonTitle = "Rời khỏi phòng chơi?", reasonBody = "Nếu thoát ra ngoài màn hình, em sẽ rời khỏi phòng chơi hiện tại.") {
    if (!studentModalRoot || studentModalRoot.innerHTML) return;
    studentModalRoot.innerHTML = `
      <div class="modal-backdrop" id="stuLeaveBackdrop" role="dialog" aria-modal="true">
        <div class="modal-card">
          <div class="modal-header">
            <h3>${icon("alertCircle", 18)} <span>${escapeHtml(reasonTitle)}</span></h3>
          </div>
          <div class="modal-body">
            <p style="margin:0; color:var(--text); line-height:1.6;">${escapeHtml(reasonBody)}</p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-primary" id="btnStuStay">${icon("fullscreen", 15)} Ở lại toàn màn hình</button>
            <button type="button" class="btn btn-danger" id="btnStuConfirmLeave">${icon("logout", 15)} Thoát phòng</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById("btnStuStay").onclick = () => {
      closeStudentModal();
      requestAppFullscreen();
    };
    document.getElementById("btnStuConfirmLeave").onclick = () => {
      closeStudentModal();
      performLeaveRoom("manual");
    };
  }

  async function performLeaveRoom(reason = "manual") {
    const code = state.roomCode;
    const pid = state.playerId;
    disableFocusGuard();
    disconnectStreams();
    if (code) sessionStorage.removeItem(`eduLive_pid_${code}`);

    if (code && pid) {
      const payload = JSON.stringify({ playerId: pid, reason });
      const url = `/api/live/rooms/${encodeURIComponent(code)}/leave`;
      if (reason === "left_screen" && navigator.sendBeacon) {
        try {
          navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
        } catch (_) {}
      } else {
        try {
          await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true });
        } catch (_) {}
      }
    }

    state.playerId = null;
    state.room = null;
    if (reason === "left_screen") {
      state.kickedForLeaving = true;
      renderLeftScreenNotice();
    } else {
      state.roomCode = "";
      renderJoinScreen();
    }
  }

  function renderLeftScreenNotice() {
    root.innerHTML = `
      <section class="student-join-card" style="text-align:center;">
        <div class="icon-emblem" style="background:var(--danger-soft); color:var(--danger); border-color:var(--danger-border);">
          ${icon("logout", 26)}
        </div>
        <span class="badge badge-rose" style="margin-bottom:10px;">Đã rời khỏi phòng chơi</span>
        <h2 style="margin:4px 0 8px; font-size:1.26rem;">Em đã thoát khỏi màn hình làm bài</h2>
        <p style="margin:0 0 20px; color:var(--text-secondary); font-size:0.92rem;">
          Chế độ toàn màn hình yêu cầu giữ nguyên màn hình trong suốt giờ chơi. Vì em đã rời sang ứng dụng hoặc tab khác, hệ thống đã tự động đưa em ra khỏi phòng.
        </p>
        <button type="button" class="btn btn-primary btn-lg" style="width:100%;" id="btnRejoinAfterLeave">
          ${icon("qr", 18)} Vào lại phòng chơi
        </button>
      </section>
    `;
    document.getElementById("btnRejoinAfterLeave").onclick = () => {
      state.kickedForLeaving = false;
      renderJoinScreen();
    };
  }

  // Global focus-lock event listeners
  window.addEventListener("popstate", () => {
    if (!state.focusGuardActive || !state.room || !isActivePlayPhase(state.room.phase)) return;
    // Immediately re-push guard so browser stays on page, then ask confirmation!
    try {
      window.history.pushState({ eduLiveGuard: 1 }, "", window.location.href);
    } catch (_) {}
    openLeaveConfirmModal(
      "Xác nhận thoát phòng chơi?",
      "Em vừa thao tác quay lại / lướt ra ngoài màn hình. Em có chắc muốn thoát khỏi phòng chơi hiện tại không?"
    );
  });

  function onFullscreenChange() {
    const inFs = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    if (inFs) {
      state.wasFullscreen = true;
      return;
    }
    if (state.focusGuardActive && state.wasFullscreen && state.room && isActivePlayPhase(state.room.phase)) {
      openLeaveConfirmModal(
        "Đã thoát chế độ Toàn màn hình",
        "Để tiếp tục chơi, em cần bật lại chế độ Toàn màn hình. Nếu không tiếp tục, em sẽ rời khỏi phòng chơi."
      );
    }
  }
  document.addEventListener("fullscreenchange", onFullscreenChange);
  document.addEventListener("webkitfullscreenchange", onFullscreenChange);

  window.addEventListener("beforeunload", (e) => {
    if (state.focusGuardActive && state.room && isActivePlayPhase(state.room.phase)) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  function toast(msg, type = "info") {
    // Silent focus mode: suppress non-error popup notifications while student is actively playing
    if (state.focusGuardActive && state.room && state.room.phase === "answering" && type !== "error") {
      return;
    }
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = msg;
    toastContainer.appendChild(el);
    setTimeout(() => el.remove(), 2600);
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

  async function init() {
    if (state.roomCode) {
      const savedPid = sessionStorage.getItem(`eduLive_pid_${state.roomCode}`);
      if (savedPid) {
        try {
          const st = await api(`/api/live/rooms/${encodeURIComponent(state.roomCode)}/player?playerId=${encodeURIComponent(savedPid)}`);
          if (st.me && st.phase !== "closed") {
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

    document.addEventListener("visibilitychange", () => {
      if (!state.playerId || !state.roomCode || !state.room) return;
      if (document.visibilityState === "hidden") {
        if (state.focusGuardActive && isActivePlayPhase(state.room.phase)) {
          // If student leaves screen/app for >1.2s, auto-remove from room and notify teacher!
          if (state.hiddenLeaveTimer) clearTimeout(state.hiddenLeaveTimer);
          state.hiddenLeaveTimer = setTimeout(() => {
            if (document.visibilityState === "hidden" && state.focusGuardActive) {
              performLeaveRoom("left_screen");
            }
          }, 1200);
        }
      } else if (document.visibilityState === "visible") {
        if (state.hiddenLeaveTimer) {
          clearTimeout(state.hiddenLeaveTimer);
          state.hiddenLeaveTimer = null;
        }
        if (state.kickedForLeaving) {
          renderLeftScreenNotice();
          return;
        }
        if (state.focusGuardActive && isActivePlayPhase(state.room.phase)) {
          requestWakeLock();
          fetchLatestPlayerState();
        }
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
      if (!state.room || st.version !== state.room.version) applyRoomState(st);
    } catch (_) {}
  }

  function connectStream() {
    disconnectStreams();
    const url = `/api/live/rooms/${encodeURIComponent(state.roomCode)}/events?role=player&playerId=${encodeURIComponent(state.playerId)}`;
    const es = new EventSource(url);
    es.addEventListener("state", (ev) => {
      try { applyRoomState(JSON.parse(ev.data)); } catch (_) {}
    });
    state.sse = es;

    state.pollTimer = setInterval(fetchLatestPlayerState, 3000);

    state.tickTimer = setInterval(() => {
      if (!state.room || !["answering", "bridge_debate", "impostor_vote"].includes(state.room.phase) || state.localRemaining === null) return;
      state.localRemaining = Math.max(0, +(state.localRemaining - 0.5).toFixed(1));
      const el = document.getElementById("studentTimerPill");
      if (el) {
        const sec = Math.ceil(state.localRemaining);
        el.innerHTML = `${icon("clock", 13)} ${sec > 0 ? `${sec}s` : "Hết giờ"}`;
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
    state.sabotageArmed = false;
    state.selectedWire = null;

    if (q.type === "bomb_module") state.draft = { wireIndex: null };
    else if (q.type === "mcq") state.draft = { choice: null };
    else if (q.type === "true_false") state.draft = { answers: Array((q.data.statements || []).length).fill(null) };
    else if (q.type === "short_answer") state.draft = { text: "" };
    else if (q.type === "fill_blank") {
      const n = q.data.blankCount || (q.data.blanks ? q.data.blanks.length : 1);
      state.draft = { blanks: Array(n).fill("") };
    } else if (q.type === "drag_order") {
      state.draft = { order: (q.data.shuffledItems || []).map((it) => it.id) };
    } else if (q.type === "drag_match") {
      state.draft = { matches: Array((q.data.leftItems || []).length).fill(null) };
    }
  }

  function applyRoomState(next) {
    const prevQId = state.room && state.room.question ? state.room.question.id : null;
    const prevPhase = state.room ? state.room.phase : null;
    const prevReveal = state.room ? state.room.revealAnswer : false;
    const prevExpl = state.room ? state.room.showExplanation : false;
    const prevNote = state.room ? state.room.teacherNote : "";
    const prevSub = Boolean(state.room && state.room.mySubmission);
    const prevSubPayload = state.room && state.room.mySubmission ? JSON.stringify(state.room.mySubmission.payload || {}) : "";
    const prevModeJson = state.room ? JSON.stringify(state.room.modeData || {}) : "";

    state.room = next;
    state.localRemaining = next.remainingSeconds;

    if (next.phase === "closed" && prevPhase !== "closed") {
      disableFocusGuard();
      disconnectStreams();
      sessionStorage.removeItem(`eduLive_pid_${state.roomCode}`);
    } else if (next.phase === "finished") {
      disableFocusGuard();
    } else if (isActivePlayPhase(next.phase) && next.me) {
      enableFocusGuard();
    }

    if (next.question) initDraftForQuestion(next.question);

    const nextQId = next.question ? next.question.id : null;
    const nextSub = Boolean(next.mySubmission);
    const nextSubPayload = next.mySubmission ? JSON.stringify(next.mySubmission.payload || {}) : "";
    const nextModeJson = JSON.stringify(next.modeData || {});
    const structuralChange =
      prevQId !== nextQId ||
      prevPhase !== next.phase ||
      prevReveal !== next.revealAnswer ||
      prevExpl !== next.showExplanation ||
      prevNote !== next.teacherNote ||
      prevSub !== nextSub ||
      prevSubPayload !== nextSubPayload ||
      prevModeJson !== nextModeJson;

    if (!structuralChange && prevPhase === "answering" && !nextSub) {
      const cntEl = document.getElementById("studentSubCount");
      if (cntEl) cntEl.textContent = `${next.submittedCount}/${next.playerCount} đã nộp`;
      return;
    }

    renderRoomView();
  }

  // =========================================================================
  // SCREEN 1: JOIN ROOM
  // =========================================================================
  function renderJoinScreen() {
    root.innerHTML = `
      <section class="student-join-card">
        <div style="text-align:center; margin-bottom:18px;">
          <div class="lg-brand-icon" style="margin:0 auto 12px; width:52px; height:52px; border-radius:16px;">
            ${icon("graduation", 26)}
          </div>
          <h1 style="margin:0 0 4px; font-size:1.36rem; font-weight:800;">Tham Gia Phòng Chơi</h1>
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

          <label class="field-label" style="text-align:center;">Chọn màu biểu tượng của em</label>
          <div class="avatar-picker" id="avatarPicker">
            ${AVATAR_PALETTES.map(
              (pal) => `<button type="button" class="avatar-opt ${pal.id === state.avatar ? "selected" : ""}" data-av="${pal.id}" style="background:${pal.bg}; color:${pal.fg}; border-color:${pal.id === state.avatar ? pal.fg : pal.border}; font-size:0.86rem; font-weight:800;">HS</button>`
            ).join("")}
          </div>

          <div id="joinError" style="color:var(--danger); font-size:0.88rem; font-weight:600; margin-bottom:10px; text-align:center;"></div>

          <button type="submit" class="btn btn-primary btn-lg" style="width:100%;" id="btnJoinSubmit">
            ${icon("play", 18)} Vào phòng chơi ngay
          </button>
          <p style="margin:10px 0 0; font-size:0.78rem; color:var(--text-muted); text-align:center; line-height:1.45;">
            Màn hình sẽ tự động bật chế độ <strong>Toàn màn hình</strong>. Rời ra ngoài màn hình khi đang chơi sẽ thoát khỏi phòng.
          </p>
        </form>
      </section>
    `;

    root.querySelectorAll("[data-av]").forEach((btn) => {
      btn.onclick = () => {
        state.avatar = btn.dataset.av;
        root.querySelectorAll("[data-av]").forEach((b) => {
          const isSel = b === btn;
          const pal = AVATAR_PALETTES.find((p) => p.id === b.dataset.av);
          b.classList.toggle("selected", isSel);
          if (pal) b.style.borderColor = isSel ? pal.fg : pal.border;
        });
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
      // Request fullscreen right inside the user tap gesture!
      requestAppFullscreen();
      try {
        const res = await api(`/api/live/rooms/${encodeURIComponent(code)}/join`, {
          method: "POST",
          body: JSON.stringify({ name, className: cls, avatar: state.avatar }),
        });
        state.roomCode = code;
        state.playerId = res.playerId;
        state.playerName = name;
        state.className = cls;
        state.kickedForLeaving = false;
        localStorage.setItem("eduLive_name", name);
        localStorage.setItem("eduLive_class", cls);
        localStorage.setItem("eduLive_avatar", state.avatar);
        sessionStorage.setItem(`eduLive_pid_${code}`, res.playerId);
        enableFocusGuard();
        applyRoomState(res.state);
        connectStream();
      } catch (err) {
        exitAppFullscreen();
        errEl.textContent = err.message;
        btn.disabled = false;
        btn.innerHTML = `${icon("play", 18)} Vào phòng chơi ngay`;
      }
    };
  }

  // =========================================================================
  // SCREEN 2: IN-ROOM STUDENT VIEWS
  // =========================================================================
  function renderRoomView() {
    const r = state.room;
    if (!r) return;

    // Instant notification when teacher exits/closes the room!
    if (r.phase === "closed") {
      root.innerHTML = `
        <section class="student-join-card" style="text-align:center;">
          <div class="icon-emblem" style="background:var(--danger-soft); color:var(--danger); border-color:var(--danger-border);">
            ${icon("logout", 26)}
          </div>
          <span class="badge badge-rose" style="margin-bottom:10px;">Phòng chơi đã đóng</span>
          <h2 style="margin:4px 0 8px; font-size:1.3rem;">Giáo viên đã kết thúc phòng chơi</h2>
          <p style="margin:0 0 18px; color:var(--text-secondary); font-size:0.93rem;">
            Phiên tương tác <strong>${escapeHtml(r.setTitle || "")}</strong> (Mã phòng <code>${escapeHtml(r.code)}</code>) đã được giáo viên đóng lại.
          </p>
          ${r.me && r.scoringEnabled ? `
            <div style="display:flex; justify-content:center; gap:10px; flex-wrap:wrap; margin-bottom:20px;">
              <span class="badge badge-blue" style="font-size:0.94rem; padding:7px 13px;">Hạng #${r.me.rank || "-"}</span>
              <span class="badge badge-success" style="font-size:0.94rem; padding:7px 13px;">${fmtScore(r.me.score)} điểm</span>
              <span class="badge badge-purple" style="font-size:0.94rem; padding:7px 13px;">Đúng ${r.me.correctCount}/${r.totalQuestions} câu</span>
            </div>
          ` : ""}
          <button type="button" class="btn btn-primary btn-lg" style="width:100%;" id="btnRejoinOther">
            ${icon("qr", 18)} Tham gia phòng chơi khác
          </button>
        </section>
      `;
      document.getElementById("btnRejoinOther").onclick = () => {
        state.roomCode = "";
        state.playerId = null;
        state.room = null;
        renderJoinScreen();
      };
      return;
    }

    if (!r.me) {
      disconnectStreams();
      toast("Em đã rời khỏi phòng chơi.", "error");
      renderJoinScreen();
      return;
    }

    const hudHtml = `
      <header class="student-hud">
        <div style="display:flex; align-items:center; gap:10px; min-width:0;">
          ${avatarBadge(r.me.name, r.me.avatar, 34)}
          <div style="min-width:0;">
            <div style="font-weight:800; font-size:0.94rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(r.me.name)}</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">Phòng ${escapeHtml(r.code)} ${r.me.className ? `• ${escapeHtml(r.me.className)}` : ""}</div>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
          ${r.scoringEnabled ? `<span class="badge badge-blue" style="font-family:var(--font-mono);">${fmtScore(r.me.score)} đ</span>` : ""}
          ${["answering", "bridge_debate", "impostor_vote"].includes(r.phase) && state.localRemaining !== null ? `<span class="badge ${Math.ceil(state.localRemaining) <= 5 ? "badge-rose" : "badge-blue"}" id="studentTimerPill">${icon("clock", 13)} ${Math.ceil(state.localRemaining)}s</span>` : ""}
          ${isActivePlayPhase(r.phase) ? `<button type="button" class="icon-btn" id="btnHudLeave" title="Thoát phòng chơi" aria-label="Thoát phòng">${icon("logout", 17)}</button>` : ""}
        </div>
      </header>
    `;

    let bodyHtml = "";
    const gm = GAME_MODES[r.gameMode] || GAME_MODES.classic;

    if (r.phase === "lobby") {
      const md = r.modeData || {};
      const bombLobbySquadHtml =
        r.gameMode === "bomb_defusal" && md.squadName
          ? `
            <div style="margin-top:16px; padding:14px; border-radius:14px; background:var(--surface-subtle); border:1.5px solid var(--border); text-align:left;">
              <div style="font-weight:800; font-size:0.92rem; color:var(--primary); display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
                <span>${icon("shield", 15)} Đội của em: ${escapeHtml(md.squadName)}</span>
                <span class="badge badge-amber">${(md.teammates || []).length} thành viên</span>
              </div>
              <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px;">
                ${(md.teammates || []).map((t) => `<span class="badge badge-blue">${escapeHtml(t.name)}</span>`).join("")}
              </div>
              ${(md.allSquads || []).length > 1 ? `
                <div style="font-size:0.76rem; color:var(--text-muted); margin-bottom:6px;">Chọn ngồi cùng nhóm bạn:</div>
                <div style="display:flex; flex-wrap:wrap; gap:5px;">
                  ${md.allSquads
                    .map(
                      (sq) => `<button type="button" class="btn btn-sm ${sq.id === md.squadId ? "btn-primary" : "btn-outline"}" style="padding:4px 9px; font-size:0.75rem;" data-switch-sq="${escapeHtml(sq.id)}">${escapeHtml(sq.name)} (${sq.count})</button>`
                    )
                    .join("")}
                </div>
              ` : ""}
            </div>
          `
          : "";

      bodyHtml = `
        <section class="student-q-card" style="text-align:center; padding:30px 18px; margin:auto 0;">
          <div style="margin-bottom:10px;">${avatarBadge(r.me.name, r.me.avatar, 54)}</div>
          <div style="display:flex; justify-content:center; gap:6px; flex-wrap:wrap; margin-bottom:8px;">
            <span class="badge badge-success">${icon("checkCircle", 14)} Đã vào phòng</span>
            <span class="badge badge-${gm.accent}">${icon(gm.icon, 14)} ${escapeHtml(gm.title)}</span>
          </div>
          <h2 style="margin:6px 0 6px; font-size:1.22rem;">${escapeHtml(r.setTitle)}</h2>
          <p style="margin:0 0 14px; color:var(--text-secondary); font-size:0.88rem;">${escapeHtml(gm.desc)}</p>
          <div class="badge badge-blue" style="font-size:0.86rem;">${icon("users", 14)} Hiện có ${r.playerCount} bạn trong phòng</div>
          ${bombLobbySquadHtml}
        </section>
      `;
    } else if (r.phase === "finished") {
      bodyHtml = renderStudentFinished(r);
    } else if (r.phase === "leaderboard") {
      bodyHtml = renderStudentLeaderboard(r);
    } else if (r.gameMode === "math_impostor" && (r.phase === "impostor_vote" || r.phase === "impostor_vote_result")) {
      bodyHtml = renderStudentImpostorMeeting(r);
    } else if (r.gameMode === "bomb_defusal" && r.question) {
      bodyHtml = renderStudentBombMode(r, r.question);
    } else if (r.gameMode === "glass_bridge" && r.question && r.phase === "bridge_debate") {
      bodyHtml = renderStudentBridgeDebate(r, r.question);
    } else if (r.question) {
      const q = r.question;
      const meta = getTypeMeta(q.type);
      const hasSubmitted = Boolean(r.mySubmission && r.mySubmission.submitted);
      const canAnswer = r.phase === "answering" && (!hasSubmitted || (r.allowChangeAnswer && state.editingAfterSubmit));
      const secretHeaderHtml = r.gameMode === "math_impostor" ? renderImpostorSecretHeader(r) : "";

      bodyHtml = `
        ${secretHeaderHtml}
        <section class="student-q-card">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;">
            <span class="badge badge-${gm.accent}">${r.gameMode === "glass_bridge" ? `Nhịp cầu ${r.questionIndex + 1}/${r.totalQuestions}` : `Câu ${r.questionIndex + 1}/${r.totalQuestions} • ${meta.short}`}</span>
            <span style="font-size:0.78rem; color:var(--text-muted); font-weight:600;" id="studentSubCount">${r.submittedCount}/${r.playerCount} đã nộp</span>
          </div>
          <div class="student-prompt">${formatRichText(q.prompt)}</div>
        </section>

        ${canAnswer ? renderInteractiveWidget(q, r) : renderPostSubmitOrReview(r, q)}
      `;
    }

    root.innerHTML = hudHtml + `<div id="studentBodyRoot" style="flex:1; display:flex; flex-direction:column;">${bodyHtml}</div>`;
    renderMathIn(document.getElementById("studentBodyRoot"));
    const hudLeaveBtn = document.getElementById("btnHudLeave");
    if (hudLeaveBtn) {
      hudLeaveBtn.onclick = () =>
        openLeaveConfirmModal(
          "Rời khỏi phòng chơi?",
          "Nếu thoát bây giờ, em sẽ rời khỏi phòng chơi hiện tại và dừng tính điểm."
        );
    }
    bindInteractiveHandlers();
  }

  // =========================================================================
  // COLLABORATIVE GAME MODES — STUDENT INTERFACES (ZERO EMOJIS, PURE SVG)
  // =========================================================================
  function getBombRoleMeta(role) {
    const map = {
      cutter: {
        badge: "THỢ GỠ BOM • CẦM KÌM CẮT",
        ico: "wireCutter",
        accent: "rose",
        short: "Cắt dây",
        hint: "Máy em KHÔNG hiện đề bài hay đáp án. Hãy hỏi đồng đội màu dây đúng rồi bấm cắt 1 nhát quyết định!",
      },
      analyst: {
        badge: "CHUYÊN VIÊN ĐỀ BÀI",
        ico: "bookOpen",
        accent: "blue",
        short: "Đề bài",
        hint: "Máy em giữ ĐỀ BÀI TOÁN nhưng không có sơ đồ màu dây. Hãy đọc đề, tính kết quả và báo cho đồng đội giữ bảng mã!",
      },
      decoder_ab: {
        badge: "GIẢI MÃ DÂY (ĐỎ & XANH)",
        ico: "bombModule",
        accent: "amber",
        short: "Mã A-B",
        hint: "Máy em giữ bảng mã của 2 dây đầu. Hãy nghe kết quả Toán từ đồng đội để đối chiếu và báo màu dây đúng!",
      },
      decoder_cd: {
        badge: "GIẢI MÃ DÂY (VÀNG & LỤC)",
        ico: "bombModule",
        accent: "amber",
        short: "Mã C-D",
        hint: "Máy em giữ bảng mã của 2 dây cuối. Hãy nghe kết quả Toán từ đồng đội để đối chiếu và báo màu dây đúng!",
      },
      decoder_all: {
        badge: "CHUYÊN VIÊN SƠ ĐỒ MÀU DÂY",
        ico: "bombModule",
        accent: "amber",
        short: "Bảng mã",
        hint: "Máy em giữ toàn bộ bảng ánh xạ Đáp án sang Màu dây nhưng không thấy đề bài. Hãy phối hợp cùng đồng đội!",
      },
      intel: {
        badge: "TRINH SÁT HỖ TRỢ",
        ico: "radar",
        accent: "purple",
        short: "Trinh sát",
        hint: "Em thấy cả đề bài lẫn bảng mã nhưng không cầm kìm cắt. Hãy giải nhanh và bấm Báo tín hiệu dây cho Thợ gỡ bom!",
      },
      solo_cutter: {
        badge: "ĐẶC NHIỆM ĐỘC LẬP",
        ico: "wireCutter",
        accent: "amber",
        short: "Độc lập",
        hint: "Đội có 1 thành viên nên em kiêm cả giải đề Toán lẫn cắt dây gỡ bom!",
      },
    };
    return map[role] || map.intel;
  }

  function renderStudentBombMode(r, q) {
    const md = r.modeData || {};
    const role = md.role || q.bombRole || "intel";
    const rm = getBombRoleMeta(role);
    const shield = md.shield ?? 3;
    const squadCut = md.squadCut;
    const isCutter = role === "cutter" || role === "solo_cutter";

    const shieldPips = [0, 1, 2]
      .map(
        (idx) =>
          `<span class="bomb-shield-pip ${idx < shield ? "active" : "lost"}" title="Khiên năng lượng">${icon("shield", 14)}</span>`
      )
      .join("");

    const squadHeaderHtml = `
      <section class="student-q-card" style="padding:14px 16px; margin-bottom:12px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="badge badge-${rm.accent}">${icon(rm.ico, 14)} ${rm.badge}</span>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:0.78rem; font-weight:800; color:var(--text-secondary);">${escapeHtml(md.squadName || "Đội")}</span>
            <div class="bomb-shield-row">${shieldPips}</div>
          </div>
        </div>
        <div style="font-size:0.84rem; color:var(--text-secondary); line-height:1.45; margin-bottom:10px;">
          ${escapeHtml(rm.hint)}
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center;">
          <span style="font-size:0.74rem; color:var(--text-muted); font-weight:700;">Đồng đội Câu ${r.questionIndex + 1}/${r.totalQuestions}:</span>
          ${(md.teammates || [])
            .map((tm) => {
              const trm = getBombRoleMeta(tm.role);
              return `<span class="badge ${tm.id === r.me.id ? "badge-blue" : "badge-slate"}" style="font-size:0.73rem;">${escapeHtml(tm.name)} • ${trm.short}</span>`;
            })
            .join("")}
        </div>
      </section>
    `;

    // Active defusal phase before the squad cuts a wire
    if (r.phase === "answering" && !squadCut) {
      const promptBlock = q.prompt
        ? `
          <section class="student-q-card" style="margin-bottom:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <span class="badge badge-blue">${icon("bookOpen", 13)} ĐỀ BÀI TOÁN CỦA ĐỘI</span>
              <span style="font-size:0.76rem; color:var(--text-muted); font-weight:600;">${r.submittedCount} đội đã cắt dây</span>
            </div>
            <div class="student-prompt">${formatRichText(q.prompt)}</div>
          </section>
        `
        : "";

      if (isCutter) {
        const wires = q.wires || [];
        return `
          ${squadHeaderHtml}
          ${promptBlock}
          <section class="student-q-card" style="border-color:var(--danger-border);">
            <div style="font-weight:800; font-size:0.95rem; margin-bottom:10px; display:flex; align-items:center; gap:7px; color:var(--danger);">
              ${icon("wireCutter", 18)} HỘP MẠCH NỔ — CHỌN DÂY ĐỂ CẮT
            </div>
            <div class="student-wire-list">
              ${wires
                .map((w) => {
                  const sigCnt = (md.signalCounts && md.signalCounts[w.wireIndex]) || 0;
                  const isSel = state.selectedWire === w.wireIndex;
                  return `
                    <button type="button" class="wire-cut-btn ${isSel ? "selected" : ""}" data-pick-wire="${w.wireIndex}" style="--wire-hex:${escapeHtml(w.hex)};">
                      <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; width:100%;">
                        <span style="font-weight:800; font-size:0.95rem; display:inline-flex; align-items:center; gap:8px;">
                          <span class="wire-color-dot" style="background:${escapeHtml(w.hex)};"></span>
                          ${escapeHtml(w.label)}
                        </span>
                        ${sigCnt > 0 ? `<span class="badge badge-amber">${sigCnt} tín hiệu đồng đội</span>` : `<span style="font-size:0.76rem; color:var(--text-muted);">${isSel ? "Đang đặt kìm cắt" : "Chạm để đặt kìm"}</span>`}
                      </div>
                      <div class="bomb-wire-svg-wrap">${wireSvg(w.hex, false)}</div>
                      ${w.optionText !== undefined ? `<div style="font-size:0.88rem; font-weight:600; color:var(--text-secondary); text-align:left; width:100%;">${formatRichText(w.optionText)}</div>` : ""}
                    </button>
                  `;
                })
                .join("")}
            </div>
            <button type="button" class="btn btn-danger btn-lg" style="width:100%; margin-top:14px;" data-cut-wire="1" ${state.selectedWire === null ? "disabled" : ""}>
              ${icon("wireCutter", 18)} ${state.selectedWire === null ? "Hãy chạm chọn 1 sợi dây phía trên" : `Cắt dứt khoát ${(q.wires[state.selectedWire] || {}).label || "dây đã chọn"}`}
            </button>
          </section>
        `;
      }

      // Non-cutter roles: Decoder / Analyst / Intel
      const wires = q.wires || [];
      const manualHtml =
        wires.length > 0
          ? `
            <section class="student-q-card">
              <div style="font-weight:800; font-size:0.94rem; margin-bottom:10px; display:flex; align-items:center; gap:7px;">
                ${icon("bombModule", 18)} SƠ ĐỒ ÁNH XẠ ĐÁP ÁN ↔ MÀU DÂY
              </div>
              <div class="wire-manual-list">
                ${wires
                  .map((w) => {
                    const isSignaled = md.mySignal === w.wireIndex;
                    return `
                      <div class="wire-manual-card" style="border-left:5px solid ${escapeHtml(w.hex)};">
                        <div style="flex:1; min-width:0;">
                          <div style="font-weight:800; font-size:0.86rem; color:${escapeHtml(w.hex)}; margin-bottom:3px;">
                            NẾU ĐÁP ÁN ĐÚNG LÀ PHƯƠNG ÁN DƯỚI ĐÂY → CẮT ${escapeHtml(w.label.toUpperCase())}
                          </div>
                          <div style="font-weight:700; font-size:1rem; color:var(--text);">${formatRichText(w.optionText || "")}</div>
                        </div>
                        <button type="button" class="btn btn-sm ${isSignaled ? "btn-primary" : "btn-outline"}" data-signal-wire="${w.wireIndex}">
                          ${icon("radar", 14)} ${isSignaled ? "Đã báo" : "Báo dây này"}
                        </button>
                      </div>
                    `;
                  })
                  .join("")}
              </div>
            </section>
          `
          : `
            <div class="feedback-banner waiting">
              <div style="margin-bottom:6px;">${icon("users", 28)}</div>
              <div style="font-weight:800; font-size:1.02rem;">Hãy giải đề bài phía trên và đọc to kết quả cho đồng đội!</div>
              <div style="font-size:0.86rem; margin-top:4px;">Đồng đội giữ Sơ đồ màu dây sẽ đối chiếu kết quả của em để chỉ huy Thợ gỡ bom cắt đúng sợi dây.</div>
            </div>
          `;

      return squadHeaderHtml + promptBlock + manualHtml;
    }

    // Post-cut waiting or revealed state
    if (!r.revealAnswer) {
      return `
        ${squadHeaderHtml}
        <div class="feedback-banner waiting">
          <div style="margin-bottom:6px;">${icon("wireCutter", 28)}</div>
          <div style="font-weight:800; font-size:1.06rem;">
            ${squadCut ? `Đội đã cắt ${escapeHtml(squadCut.wireLabel)}!` : "Đã khóa kìm cắt dây!"}
          </div>
          <div style="font-size:0.88rem; margin-top:4px;">Hãy nhìn lên màn hình máy chiếu để hồi hộp chờ kiểm tra mạch bom của toàn lớp.</div>
        </div>
      `;
    }

    const defused = Boolean(squadCut && squadCut.isDefused);
    const outcomeBanner = defused
      ? `
        <div class="feedback-banner correct">
          <div style="margin-bottom:4px;">${icon("shieldCheck", 30)}</div>
          <div style="font-weight:800; font-size:1.14rem;">Gỡ bom thành công!</div>
          <div style="font-family:var(--font-mono); font-weight:800; margin-top:4px;">+${fmtScore(squadCut.pointsEarned)} điểm cho cả đội</div>
        </div>
      `
      : `
        <div class="feedback-banner wrong">
          <div style="margin-bottom:4px;">${icon("bombModule", 30)}</div>
          <div style="font-weight:800; font-size:1.1rem;">${squadCut ? `Cắt nhầm ${escapeHtml(squadCut.wireLabel)} — Mất 1 khiên!` : "Chưa kịp cắt dây — Mất 1 khiên!"}</div>
        </div>
      `;

    const keyCard = `
      <div class="card" style="margin-bottom:12px; border-color:var(--success); background:var(--success-soft);">
        <strong style="color:var(--success); display:inline-flex; align-items:center; gap:6px;">
          ${icon("check", 15)} Dây đúng của đội: ${escapeHtml(q.correctWireLabel || "")}
        </strong>
        <div style="margin-top:4px; font-weight:700;">Đáp án Toán: ${formatRichText(q.correctText || "")}</div>
      </div>
    `;

    const explCard =
      (r.showExplanation || r.revealAnswer) && q.explanation
        ? `
          <div class="explanation-card" style="padding:16px 18px;">
            <div class="explanation-title" style="font-size:1rem;">${icon("bulb", 18)} Lời giải</div>
            <div style="font-size:0.95rem;">${formatRichText(q.explanation)}</div>
          </div>
        `
        : "";

    return squadHeaderHtml + outcomeBanner + keyCard + explCard;
  }

  function renderImpostorSecretHeader(r) {
    const md = r.modeData || {};
    const power = md.reactorPower ?? 55;
    const isImp = md.secretRole === "impostor";
    const canSabotage = isImp && !md.ejected && r.phase === "answering" && !(r.mySubmission && r.mySubmission.submitted);

    let secretDrawer = "";
    if (state.peekSecretRole) {
      if (isImp) {
        const hintLetter =
          md.correctHintIndex !== null && md.correctHintIndex !== undefined
            ? String.fromCharCode(65 + Number(md.correctHintIndex))
            : null;
        secretDrawer = `
          <div class="secret-role-drawer is-impostor">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;">
              <strong style="display:inline-flex; align-items:center; gap:6px; color:#fda4af;">
                ${icon("impostorVisor", 18)} MẬT VỤ: KẺ PHÁ HOẠI NGẦM
              </strong>
              ${hintLetter ? `<span class="badge badge-rose">Đáp án chuẩn: ${hintLetter}</span>` : ""}
            </div>
            <div style="font-size:0.82rem; color:#fecdd3; margin-top:6px; line-height:1.45;">
              Em có thể chọn đúng để ẩn mình như Kỹ sư, hoặc bật Phá hoại ngầm để kéo tụt năng lượng Lò phản ứng (-11% Lò, thưởng +14đ mật).
            </div>
            ${canSabotage ? `
              <button type="button" class="btn btn-sm ${state.sabotageArmed ? "btn-danger" : "btn-outline"}" style="margin-top:8px; width:100%; border-color:#fb7185; color:${state.sabotageArmed ? "#fff" : "#ffe4e6"};" data-toggle-sabotage="1">
                ${icon("sabotage", 15)} ${state.sabotageArmed ? "ĐANG BẬT PHÁ HOẠI NGẦM CÂU NÀY" : "Bật chế độ Phá hoại ngầm câu này"}
              </button>
            ` : ""}
          </div>
        `;
      } else {
        secretDrawer = `
          <div class="secret-role-drawer is-crew">
            <strong style="display:inline-flex; align-items:center; gap:6px; color:#6ee7b7;">
              ${icon("shieldCheck", 18)} VAI TRÒ: KỸ SƯ TOÁN HỌC
            </strong>
            <div style="font-size:0.82rem; color:#d1fae5; margin-top:5px; line-height:1.45;">
              Giải chính xác để nạp Lò phản ứng lên 100% và theo dõi manh mối Radar để vạch mặt Kẻ Phá Hoại trong cuộc họp!
            </div>
          </div>
        `;
      }
    }

    return `
      <div class="secret-role-bar">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;">
          <div style="display:flex; align-items:center; gap:7px;">
            <span class="badge ${power < 35 ? "badge-rose" : "badge-emerald"}">${icon("reactor", 14)} Lò: ${power}%</span>
            ${md.ejected ? `<span class="badge badge-amber">Đã rời hội đồng (Vẫn giải Toán tích điểm)</span>` : ""}
          </div>
          <button type="button" class="btn btn-outline btn-sm" style="padding:4px 10px; font-size:0.76rem;" data-peek-role="1">
            ${icon("eye", 14)} ${state.peekSecretRole ? "Ẩn vai trò mật" : "Xem vai trò mật"}
          </button>
        </div>
        ${secretDrawer}
      </div>
    `;
  }

  function renderStudentImpostorMeeting(r) {
    const md = r.modeData || {};
    const clues = md.clues || [];
    const cluesHtml = clues.length
      ? `
        <div class="radar-clue-box" style="margin-bottom:12px;">
          <div style="font-weight:800; font-size:0.84rem; color:var(--primary); display:flex; align-items:center; gap:6px; margin-bottom:6px;">
            ${icon("radar", 16)} MANH MỐI TỪ RADAR TRẠM TOÁN HỌC
          </div>
          ${clues.map((c) => `<div style="font-size:0.88rem; font-weight:600; padding:4px 0;">• ${escapeHtml(c)}</div>`).join("")}
        </div>
      `
      : "";

    if (r.phase === "impostor_vote") {
      let voteBody = "";
      if (md.ejected) {
        voteBody = `
          <div class="feedback-banner partial">
            <div style="margin-bottom:6px;">${icon("impostorVisor", 28)}</div>
            <div style="font-weight:800;">Em đang ở chế độ Quan sát viên</div>
            <div style="font-size:0.86rem; margin-top:4px;">Em đã bị bỏ phiếu loại ở vòng trước nên không tham gia bỏ phiếu kín vòng này.</div>
          </div>
        `;
      } else if (md.myVote) {
        voteBody = `
          <div class="feedback-banner waiting">
            <div style="margin-bottom:6px;">${icon("checkCircle", 28)}</div>
            <div style="font-weight:800; font-size:1.05rem;">Đã gửi phiếu bầu kín!</div>
            <div style="font-size:0.86rem; margin-top:4px;">Hãy hướng mắt lên màn hình chính chờ công bố kết quả kiểm phiếu của cả lớp.</div>
          </div>
        `;
      } else {
        const suspects = md.suspects || [];
        voteBody = `
          <div class="student-suspect-list">
            ${suspects
              .map(
                (s) => `
                <button type="button" class="student-suspect-btn" data-vote-suspect="${escapeHtml(s.id)}">
                  <span style="display:inline-flex; align-items:center; gap:9px; min-width:0;">
                    ${avatarBadge(s.name, s.avatar, 30)}
                    <span style="font-weight:700; font-size:0.93rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(s.name)}</span>
                  </span>
                  <span class="badge badge-rose">Bỏ phiếu</span>
                </button>
              `
              )
              .join("")}
          </div>
          <button type="button" class="btn btn-outline btn-lg" style="width:100%; margin-top:12px;" data-vote-suspect="skip">
            ${icon("shield", 16)} Bỏ qua phiếu bầu (Chưa đủ bằng chứng)
          </button>
        `;
      }

      return `
        <section class="student-q-card">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
            <span class="badge badge-rose">${icon("voteBox", 14)} HỘI ĐỒNG KHẨN CẤP</span>
          </div>
          <h3 style="margin:4px 0 6px; font-size:1.12rem;">Ai là Kẻ Phá Hoại Lò Phản Ứng?</h3>
          <p style="margin:0; font-size:0.85rem; color:var(--text-secondary);">Thảo luận nhanh cùng cả lớp dựa trên dấu vết Radar và chọn 1 nghi phạm.</p>
        </section>
        ${cluesHtml}
        ${voteBody}
      `;
    }

    // impostor_vote_result
    const res = md.lastVoteResult || {};
    const badgeCls = res.ejectedId
      ? res.wasImpostor
        ? "correct"
        : "wrong"
      : "partial";
    return `
      ${cluesHtml}
      <div class="feedback-banner ${badgeCls}">
        <div style="margin-bottom:6px;">${icon(res.wasImpostor ? "shieldCheck" : "impostorVisor", 30)}</div>
        <div style="font-weight:800; font-size:1.08rem;">${escapeHtml(res.message || "Đã hoàn tất kiểm phiếu hội đồng.")}</div>
        <div style="font-size:0.86rem; margin-top:6px;">Chờ giáo viên mở câu hỏi tiếp theo trên màn hình chính...</div>
      </div>
    `;
  }

  function renderStudentBridgeDebate(r, q) {
    const md = r.modeData || {};
    const counts = md.panelCounts || [0, 0, 0, 0];
    const myChoice =
      r.mySubmission && r.mySubmission.payload && r.mySubmission.payload.choice !== undefined
        ? Number(r.mySubmission.payload.choice)
        : null;
    const opts = (q.data && q.data.options) || [];

    return `
      <div class="bridge-debate-alert">
        <div style="font-weight:800; font-size:0.95rem; display:flex; align-items:center; gap:7px;">
          ${icon("debate", 18)} PHA TRANH LUẬN — CHẠM ĐỂ NHẢY ĐỔI Ô KÍNH!
        </div>
        <div style="font-size:0.82rem; margin-top:3px; opacity:0.92;">
          Đứng trên kính cường lực sẽ sống sót, kính thường sẽ vỡ sập! Em có thể nhảy sang ô kính khác ngay lập tức trước khi hết giờ.
        </div>
      </div>

      <section class="student-q-card" style="margin-bottom:12px;">
        <div class="student-prompt" style="margin-top:0;">${formatRichText(q.prompt)}</div>
      </section>

      <div class="student-bridge-grid">
        ${opts
          .map((opt, i) => {
            const standing = myChoice === i;
            return `
              <button type="button" class="student-bridge-tile ${standing ? "standing" : ""}" data-bridge-jump="${i}">
                <div style="display:flex; align-items:center; justify-content:space-between; width:100%; margin-bottom:6px;">
                  <span class="opt-letter-badge" style="background:${OPT_COLORS[i % OPT_COLORS.length]};">${String.fromCharCode(65 + i)}</span>
                  <span class="badge ${standing ? "badge-success" : "badge-blue"}">${counts[i] || 0} bạn đang đứng</span>
                </div>
                <div style="font-weight:700; font-size:0.96rem; text-align:left; width:100%; margin-bottom:8px;">
                  ${formatRichText(opt)}
                </div>
                <div style="font-size:0.78rem; font-weight:800; color:${standing ? "var(--success)" : "var(--primary)"}; display:flex; align-items:center; gap:5px;">
                  ${standing ? `${icon("checkCircle", 14)} Em đang đứng tại tấm kính này` : `${icon("glassBridge", 14)} Chạm để nhảy sang kính ${String.fromCharCode(65 + i)}`}
                </div>
              </button>
            `;
          })
          .join("")}
      </div>
    `;
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
            <button type="button" class="tf-big-btn true-btn ${val === true ? "selected" : ""}" data-tf-pick="0" data-tf-val="true">${icon("check", 20)} ĐÚNG</button>
            <button type="button" class="tf-big-btn false-btn ${val === false ? "selected" : ""}" data-tf-pick="0" data-tf-val="false">${icon("close", 20)} SAI</button>
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
                      <button type="button" class="tf-pill-btn ${val === true ? "active-true" : ""}" data-tf-pick="${i}" data-tf-val="true">${icon("check", 15)} Đúng</button>
                      <button type="button" class="tf-pill-btn ${val === false ? "active-false" : ""}" data-tf-pick="${i}" data-tf-val="false">${icon("close", 15)} Sai</button>
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
          tplHtml = tplHtml.replace(`{{${i}}}`, `<button type="button" class="${cls}" data-blank-slot="${i}">${val ? escapeHtml(val) : `Ô #${i + 1}`}</button>`);
        } else {
          tplHtml = tplHtml.replace(`{{${i}}}`, `<input type="text" class="input" data-blank-input="${i}" value="${escapeHtml(val)}" placeholder="Ô #${i + 1}" style="display:inline-block; width:112px; padding:4px 8px; margin:2px 4px; font-weight:700; text-align:center;" />`);
        }
      });
      const usedCounts = {};
      blanks.forEach((v) => { if (v) usedCounts[v] = (usedCounts[v] || 0) + 1; });

      widget = `
        <div class="cloze-sentence">${tplHtml}</div>
        ${useWb ? `
          <div style="font-size:0.82rem; font-weight:700; color:var(--text-muted); margin-bottom:8px; display:flex; align-items:center; gap:6px;">
            ${icon("handClick", 15)} Chạm vào thẻ từ bên dưới để điền vào ô đang chọn:
          </div>
          <div class="wordbank-wrap">
            ${q.data.wordBank.map((w) => `<button type="button" class="wordbank-chip ${usedCounts[w] ? "used" : ""}" data-wb-chip="${escapeHtml(w)}">${escapeHtml(w)}</button>`).join("")}
          </div>
        ` : ""}
      `;
    } else if (q.type === "drag_order") {
      const lookup = {};
      (q.data.shuffledItems || []).forEach((it) => { lookup[it.id] = it.text; });
      const ord = state.draft.order || [];
      widget = `
        <div style="font-size:0.84rem; font-weight:600; color:var(--text-secondary); margin-bottom:8px; display:flex; align-items:center; gap:6px;">
          ${icon("moveVertical", 15)} Kéo thả thẻ lên/xuống hoặc dùng nút mũi tên để sắp xếp thứ tự:
        </div>
        <div class="order-list" id="studentOrderList">
          ${ord
            .map(
              (origId, pos) => `
              <div class="order-item" draggable="true" data-ord-pos="${pos}">
                <div class="order-pos-badge">${pos + 1}</div>
                <div style="flex:1; font-weight:600; font-size:0.95rem;">${formatRichText(lookup[origId] || "")}</div>
                <div class="order-arrows">
                  <button type="button" class="order-arrow-btn" data-ord-up="${pos}" ${pos === 0 ? "disabled" : ""}>${icon("arrowUp", 13)}</button>
                  <button type="button" class="order-arrow-btn" data-ord-down="${pos}" ${pos === ord.length - 1 ? "disabled" : ""}>${icon("arrowDown", 13)}</button>
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
      const rightToLeft = {};
      matches.forEach((rId, lIdx) => { if (rId !== null && rId !== undefined) rightToLeft[rId] = lIdx; });

      widget = `
        <div style="font-size:0.84rem; font-weight:600; color:var(--text-secondary); margin-bottom:8px; display:flex; align-items:center; gap:6px;">
          ${icon("link", 15)} Chạm 1 ô bên TRÁI rồi chạm ô tương ứng bên PHẢI để ghép cặp:
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
        ${icon("check", 18)} Gửi câu trả lời
      </button>
    `;
  }

  function bindInteractiveHandlers() {
    const r = state.room;
    if (!r) return;

    // 1. Lobby squad switcher (Bomb Defusal)
    root.querySelectorAll("[data-switch-sq]").forEach((btn) => {
      btn.onclick = async () => {
        const targetSq = btn.dataset.switchSq;
        if (!targetSq) return;
        try {
          const res = await api(`/api/live/rooms/${encodeURIComponent(state.roomCode)}/switch_squad`, {
            method: "POST",
            body: JSON.stringify({ playerId: state.playerId, squadId: targetSq }),
          });
          applyRoomState(res.state);
        } catch (err) {
          toast(err.message, "error");
        }
      };
    });

    // 2. Math Impostor secret role peek & covert sabotage toggle
    root.querySelectorAll("[data-peek-role]").forEach((btn) => {
      btn.onclick = () => {
        state.peekSecretRole = !state.peekSecretRole;
        renderRoomView();
      };
    });
    root.querySelectorAll("[data-toggle-sabotage]").forEach((btn) => {
      btn.onclick = () => {
        state.sabotageArmed = !state.sabotageArmed;
        renderRoomView();
      };
    });

    // 3. Math Impostor Emergency Meeting voting
    root.querySelectorAll("[data-vote-suspect]").forEach((btn) => {
      btn.onclick = async () => {
        const suspectId = btn.dataset.voteSuspect;
        root.querySelectorAll("[data-vote-suspect]").forEach((b) => {
          b.disabled = true;
        });
        try {
          const res = await api(`/api/live/rooms/${encodeURIComponent(state.roomCode)}/vote`, {
            method: "POST",
            body: JSON.stringify({ playerId: state.playerId, suspectId }),
          });
          toast("Đã gửi phiếu bầu kín!", "success");
          applyRoomState(res.state);
        } catch (err) {
          toast(err.message, "error");
          renderRoomView();
        }
      };
    });

    if (!r.question) return;
    const q = r.question;

    // 4. Bomb Defusal wire selection, cutting & teammate signaling
    root.querySelectorAll("[data-pick-wire]").forEach((btn) => {
      btn.onclick = () => {
        state.selectedWire = Number(btn.dataset.pickWire);
        renderRoomView();
      };
    });
    root.querySelectorAll("[data-cut-wire]").forEach((btn) => {
      btn.onclick = async () => {
        if (state.selectedWire === null) {
          toast("Hãy chạm chọn 1 sợi dây trước khi cắt!", "error");
          return;
        }
        btn.disabled = true;
        try {
          const res = await api(`/api/live/rooms/${encodeURIComponent(state.roomCode)}/submit`, {
            method: "POST",
            body: JSON.stringify({
              playerId: state.playerId,
              questionId: q.id,
              payload: { wireIndex: state.selectedWire },
            }),
          });
          toast("Đã cắt dây gỡ bom!", "success");
          applyRoomState(res.state);
        } catch (err) {
          toast(err.message, "error");
          btn.disabled = false;
        }
      };
    });
    root.querySelectorAll("[data-signal-wire]").forEach((btn) => {
      btn.onclick = async () => {
        const wireIdx = Number(btn.dataset.signalWire);
        try {
          const res = await api(`/api/live/rooms/${encodeURIComponent(state.roomCode)}/submit`, {
            method: "POST",
            body: JSON.stringify({
              playerId: state.playerId,
              questionId: q.id,
              payload: { signalWire: wireIdx },
            }),
          });
          toast("Đã gửi tín hiệu màu dây tới Thợ gỡ bom!", "success");
          applyRoomState(res.state);
        } catch (err) {
          toast(err.message, "error");
        }
      };
    });

    // 5. Glass Bridge live panel jump during 15s peer debate
    root.querySelectorAll("[data-bridge-jump]").forEach((btn) => {
      btn.onclick = async () => {
        const choice = Number(btn.dataset.bridgeJump);
        try {
          const res = await api(`/api/live/rooms/${encodeURIComponent(state.roomCode)}/submit`, {
            method: "POST",
            body: JSON.stringify({
              playerId: state.playerId,
              questionId: q.id,
              payload: { choice },
            }),
          });
          applyRoomState(res.state);
        } catch (err) {
          toast(err.message, "error");
        }
      };
    });

    const reEditBtn = document.getElementById("btnEditSubmitted");
    if (reEditBtn) {
      reEditBtn.onclick = () => { state.editingAfterSubmit = true; renderRoomView(); };
    }

    const submitBtn = document.getElementById("btnSubmitAnswer");
    if (!submitBtn) return;

    if (q.type === "mcq") {
      root.querySelectorAll("[data-mcq-pick]").forEach((btn) => {
        btn.onclick = () => { state.draft.choice = Number(btn.dataset.mcqPick); renderRoomView(); };
      });
    } else if (q.type === "true_false") {
      root.querySelectorAll("[data-tf-pick]").forEach((btn) => {
        btn.onclick = () => { state.draft.answers[Number(btn.dataset.tfPick)] = btn.dataset.tfVal === "true"; renderRoomView(); };
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
          if (state.draft.blanks[idx]) state.draft.blanks[idx] = "";
          state.activeBlankIdx = idx;
          renderRoomView();
        };
      });
      root.querySelectorAll("[data-wb-chip]").forEach((btn) => {
        btn.onclick = () => {
          let slot = state.activeBlankIdx;
          if (slot < 0 || slot >= state.draft.blanks.length) slot = 0;
          state.draft.blanks[slot] = btn.dataset.wbChip;
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

      let dragSrcPos = null;
      const items = root.querySelectorAll(".order-item");
      items.forEach((el) => {
        el.addEventListener("dragstart", () => { dragSrcPos = Number(el.dataset.ordPos); el.classList.add("dragging"); });
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
        el.addEventListener("touchstart", (e) => { if (e.target.closest("button")) return; dragSrcPos = Number(el.dataset.ordPos); el.classList.add("dragging"); }, { passive: true });
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
        state.draft.matches = state.draft.matches.map((m) => (m === rOrigId ? null : m));
        state.draft.matches[lIdx] = rOrigId;
        state.pickedLeftIdx = null;
        renderRoomView();
      };
      root.querySelectorAll("[data-match-left]").forEach((el) => {
        const lIdx = Number(el.dataset.matchLeft);
        el.onclick = () => { state.pickedLeftIdx = state.pickedLeftIdx === lIdx ? null : lIdx; renderRoomView(); };
        el.addEventListener("dragstart", () => { draggedLeft = lIdx; el.classList.add("picking"); });
        el.addEventListener("dragend", () => { draggedLeft = null; el.classList.remove("picking"); });
      });
      root.querySelectorAll("[data-match-right]").forEach((el) => {
        const rId = Number(el.dataset.matchRight);
        el.onclick = () => {
          if (state.pickedLeftIdx !== null) pairUp(state.pickedLeftIdx, rId);
          else {
            const firstUnpaired = state.draft.matches.findIndex((m) => m === null);
            if (firstUnpaired >= 0) pairUp(firstUnpaired, rId);
            else toast("Hãy chạm 1 mục bên trái trước để đổi cặp ghép.");
          }
        };
        el.addEventListener("dragover", (e) => { e.preventDefault(); el.classList.add("picking"); });
        el.addEventListener("dragleave", () => el.classList.remove("picking"));
        el.addEventListener("drop", (e) => { e.preventDefault(); el.classList.remove("picking"); if (draggedLeft !== null) pairUp(draggedLeft, rId); });
      });
    }

    submitBtn.onclick = doSubmit;
  }

  async function doSubmit() {
    const r = state.room;
    if (!r || !r.question) return;
    const q = r.question;

    if (q.type === "mcq" && state.draft.choice === null) { toast("Em hãy chọn 1 phương án A, B, C hoặc D nhé!", "error"); return; }
    if (q.type === "true_false" && state.draft.answers.some((v) => v === null)) { toast("Em hãy chọn Đúng hoặc Sai cho tất cả các ý nhé!", "error"); return; }
    if (q.type === "short_answer" && !String(state.draft.text || "").trim()) { toast("Em hãy nhập câu trả lời trước khi gửi!", "error"); return; }
    if (q.type === "fill_blank" && state.draft.blanks.some((v) => !String(v || "").trim())) { toast("Em hãy điền đầy đủ tất cả các chỗ trống nhé!", "error"); return; }
    if (q.type === "drag_match" && state.draft.matches.some((m) => m === null)) { toast("Em hãy ghép đủ tất cả các cặp trước khi nộp!", "error"); return; }

    const btn = document.getElementById("btnSubmitAnswer");
    if (btn) { btn.disabled = true; btn.textContent = "Đang gửi..."; }

    const outgoingPayload =
      r.gameMode === "math_impostor" && state.sabotageArmed
        ? { ...state.draft, sabotage: true }
        : state.draft;

    try {
      const res = await api(`/api/live/rooms/${encodeURIComponent(state.roomCode)}/submit`, {
        method: "POST",
        body: JSON.stringify({ playerId: state.playerId, questionId: q.id, payload: outgoingPayload }),
      });
      state.editingAfterSubmit = false;
      toast(r.gameMode === "glass_bridge" ? "Đã bước lên tấm kính!" : "Đã nộp câu trả lời!", "success");
      applyRoomState(res.state);
    } catch (err) {
      toast(err.message, "error");
      if (btn) { btn.disabled = false; btn.innerHTML = `${icon("check", 18)} Gửi câu trả lời`; }
    }
  }

  // =========================================================================
  // POST-SUBMIT, REVEAL & EXPLANATION
  // =========================================================================
  function renderPostSubmitOrReview(r, q) {
    const sub = r.mySubmission;
    let banner = "";

    if (!r.revealAnswer) {
      banner = sub
        ? `
          <div class="feedback-banner waiting">
            <div style="margin-bottom:6px;">${icon("checkCircle", 30)}</div>
            <div style="font-weight:800; font-size:1.06rem;">Em đã gửi câu trả lời</div>
            <div style="font-size:0.88rem; margin-top:4px;">Hãy theo dõi biểu đồ tổng hợp trên màn hình chính và chờ thầy/cô phân tích.</div>
            ${r.phase === "answering" && r.allowChangeAnswer ? `<button class="btn btn-outline btn-sm" style="margin-top:12px;" id="btnEditSubmitted">${icon("edit", 14)} Sửa lại đáp án</button>` : ""}
          </div>
        `
        : `
          <div class="feedback-banner partial">
            <div style="margin-bottom:6px;">${icon("lock", 28)}</div>
            <div style="font-weight:800;">Đã khóa nhận câu trả lời</div>
            <div style="font-size:0.88rem; margin-top:4px;">Em chưa kịp nộp câu này. Hãy theo dõi màn hình chính để nghe giải thích nhé.</div>
          </div>
        `;
    } else {
      if (!sub) {
        banner = `<div class="feedback-banner wrong"><div style="margin-bottom:4px;">${icon("clock", 26)}</div><div style="font-weight:800; font-size:1.05rem;">Em chưa nộp câu này</div></div>`;
      } else if (sub.isCorrect) {
        banner = `
          <div class="feedback-banner correct">
            <div style="margin-bottom:4px;">${icon("checkCircle", 30)}</div>
            <div style="font-weight:800; font-size:1.14rem;">Chính xác tuyệt đối!</div>
            ${r.scoringEnabled ? `<div style="font-family:var(--font-mono); font-weight:800; margin-top:4px;">+${fmtScore(sub.pointsEarned)} điểm</div>` : ""}
          </div>
        `;
      } else if (sub.accuracy > 0) {
        banner = `
          <div class="feedback-banner partial">
            <div style="margin-bottom:4px;">${icon("award", 28)}</div>
            <div style="font-weight:800; font-size:1.1rem;">Đúng một phần (${Math.round(sub.accuracy * 100)}%)</div>
            ${r.scoringEnabled ? `<div style="font-family:var(--font-mono); font-weight:800; margin-top:4px;">+${fmtScore(sub.pointsEarned)} điểm</div>` : ""}
          </div>
        `;
      } else if (sub.payload && sub.payload.sabotage && sub.pointsEarned > 0) {
        banner = `
          <div class="feedback-banner partial">
            <div style="margin-bottom:4px;">${icon("sabotage", 28)}</div>
            <div style="font-weight:800; font-size:1.1rem;">Đã kích hoạt phá hoại ngầm Lò phản ứng!</div>
            ${r.scoringEnabled ? `<div style="font-family:var(--font-mono); font-weight:800; margin-top:4px;">+${fmtScore(sub.pointsEarned)} điểm mật vụ</div>` : ""}
          </div>
        `;
      } else {
        banner = `
          <div class="feedback-banner wrong">
            <div style="margin-bottom:4px;">${icon("xCircle", 28)}</div>
            <div style="font-weight:800; font-size:1.1rem;">${r.gameMode === "glass_bridge" ? "Tấm kính của em đã vỡ sập!" : "Chưa chính xác — Cùng xem giải thích nhé"}</div>
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
            <strong style="color:var(--success); display:inline-flex; align-items:center; gap:5px;">${icon("check", 15)} Đáp án đúng: ${String.fromCharCode(65 + ci)}</strong>
            <div style="margin-top:4px; font-weight:600;">${formatRichText((q.data.options || [])[ci] || "")}</div>
          </div>
        `;
      } else if (q.type === "true_false") {
        answerKeyHtml = `
          <div class="card" style="margin-bottom:12px;">
            <strong style="display:flex; align-items:center; gap:5px; margin-bottom:8px;">${icon("check", 15)} Đáp án chuẩn:</strong>
            ${(q.data.statements || []).map((st, i) => `
              <div style="display:flex; justify-content:space-between; gap:8px; padding:6px 0; border-bottom:1px solid var(--border);">
                <span>${st.text ? `<strong>${String.fromCharCode(97 + i)})</strong> ${formatRichText(st.text)}` : "Nhận định"}</span>
                <span class="badge ${st.answer ? "badge-success" : "badge-rose"}">${st.answer ? "ĐÚNG" : "SAI"}</span>
              </div>
            `).join("")}
          </div>
        `;
      } else if (q.type === "short_answer") {
        answerKeyHtml = `
          <div class="card" style="margin-bottom:12px; border-color:var(--success); background:var(--success-soft);">
            <strong style="color:var(--success);">${icon("check", 15)} Đáp án đúng:</strong>
            <span style="font-weight:800; margin-left:6px;">${escapeHtml((q.data.acceptedAnswers || [])[0] || "")}</span>
          </div>
        `;
      } else if (q.type === "fill_blank") {
        let filled = formatRichText(q.data.template || "");
        (q.data.blanks || []).forEach((b, i) => {
          filled = filled.replace(`{{${i}}}`, `<span class="badge badge-success">${escapeHtml((b.accepted || [""])[0])}</span>`);
        });
        answerKeyHtml = `<div class="card" style="margin-bottom:12px; line-height:1.9;"><strong>Đáp án hoàn chỉnh:</strong><div style="margin-top:6px;">${filled}</div></div>`;
      } else if (q.type === "drag_order") {
        answerKeyHtml = `
          <div class="card" style="margin-bottom:12px;">
            <strong style="display:block; margin-bottom:8px; color:var(--success);">Thứ tự đúng:</strong>
            ${(q.data.items || []).map((it, i) => `<div style="padding:5px 0;"><strong>#${i + 1}.</strong> ${formatRichText(it)}</div>`).join("")}
          </div>
        `;
      } else if (q.type === "drag_match") {
        answerKeyHtml = `
          <div class="card" style="margin-bottom:12px;">
            <strong style="display:block; margin-bottom:8px; color:var(--success);">Các cặp ghép đúng:</strong>
            ${(q.data.pairs || []).map((p) => `<div style="padding:5px 0; border-bottom:1px solid var(--border);">${formatRichText(p.left)} ${icon("link", 13)} ${formatRichText(p.right)}</div>`).join("")}
          </div>
        `;
      }
    }

    const explHtml =
      (r.showExplanation || r.revealAnswer) && (q.explanation || r.teacherNote)
        ? `
          <div class="explanation-card" style="padding:16px 18px;">
            <div class="explanation-title" style="font-size:1rem;">${icon("bulb", 18)} Lời giải</div>
            ${q.explanation ? `<div style="font-size:0.95rem;">${formatRichText(q.explanation)}</div>` : ""}
          </div>
        `
        : "";

    return banner + answerKeyHtml + explHtml;
  }

  function renderStudentLeaderboard(r) {
    return `
      <section class="student-q-card" style="text-align:center;">
        <span class="badge badge-purple">${icon("trophy", 14)} BẢNG XẾP HẠNG</span>
        <h2 style="margin:10px 0 4px;">Hạng của em: #${r.me.rank || "-"}</h2>
        ${r.scoringEnabled ? `<div style="font-family:var(--font-mono); font-size:1.5rem; font-weight:800; color:var(--primary);">${fmtScore(r.me.score)} điểm</div>` : ""}
        <div style="margin-top:16px; text-align:left;">
          ${(r.topLeaderboard || [])
            .map(
              (p) => `
              <div style="display:flex; justify-content:space-between; align-items:center; padding:9px 12px; border-radius:10px; background:${p.id === r.me.id ? "var(--primary-soft)" : "var(--surface-subtle)"}; margin-bottom:6px; font-weight:700;">
                <span style="display:inline-flex; align-items:center; gap:8px;">#${p.rank} ${avatarBadge(p.name, p.avatar, 24)} ${escapeHtml(p.name)}</span>
                <span style="font-family:var(--font-mono); color:var(--primary);">${fmtScore(p.score)}</span>
              </div>
            `
            )
            .join("")}
        </div>
      </section>
    `;
  }

  function renderStudentFinished(r) {
    const md = r.modeData || {};
    const impBanner =
      r.gameMode === "math_impostor" && md.winner
        ? `
          <div class="badge ${md.winner === "crew" ? "badge-success" : "badge-rose"}" style="margin-bottom:10px; font-size:0.86rem; padding:6px 12px;">
            ${icon(md.winner === "crew" ? "shieldCheck" : "impostorVisor", 15)}
            ${md.winner === "crew" ? "PHE KỸ SƯ TOÁN HỌC CHIẾN THẮNG" : "PHE KẺ PHÁ HOẠI CHIẾN THẮNG"}
          </div>
        `
        : "";
    return `
      <section class="student-q-card" style="text-align:center; padding:28px 18px;">
        <div class="icon-emblem" style="background:var(--success-soft); color:var(--success); border-color:var(--success-border);">${icon("award", 28)}</div>
        ${impBanner}
        <h2 style="margin:4px 0 4px;">Hoàn thành buổi tương tác!</h2>
        <p style="margin:0 0 16px; color:var(--text-secondary);">Cảm ơn ${escapeHtml(r.me.name)} đã tham gia cùng cả lớp.</p>
        ${r.scoringEnabled ? `
          <div style="display:flex; justify-content:center; gap:10px; margin-bottom:18px; flex-wrap:wrap;">
            <span class="badge badge-blue" style="font-size:0.96rem; padding:7px 13px;">Hạng #${r.me.rank || "-"}</span>
            <span class="badge badge-success" style="font-size:0.96rem; padding:7px 13px;">${fmtScore(r.me.score)} điểm</span>
            <span class="badge badge-purple" style="font-size:0.96rem; padding:7px 13px;">Đúng ${r.me.correctCount}/${r.totalQuestions} câu</span>
          </div>
        ` : `<div class="badge badge-success" style="font-size:0.94rem; padding:7px 13px;">Đúng trọn vẹn ${r.me.correctCount}/${r.totalQuestions} câu</div>`}
      </section>
    `;
  }

  init();
})();
