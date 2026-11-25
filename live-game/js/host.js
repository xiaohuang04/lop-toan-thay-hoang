/**
 * Edu Live Game — Teacher Host & Projector Controller
 * Unified with "Lớp toán thầy Hoàng" (edu-exam-2025):
 * - Custom monoline SVG icons only (zero system emojis)
 * - Main-site modal dialogs (no native confirm/alert/prompt)
 * - 10..20 rank-scaled scoring to 1 decimal place
 * - Auto-close when all students submit + right-edge slide-in BXH delta popup
 * - Sleek icon-only floating control dock
 * - Instant room-closed broadcast to all student phones
 */
(function () {
  "use strict";

  const { escapeHtml, formatRichText, renderMathIn, getTypeMeta } = window.LiveMath;
  const { icon, glassCrackSvg, wireSvg, avatarBadge, GAME_MODES } = window.LiveIcons;

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("embed") === "1") {
    document.body.classList.add("is-embedded");
  }

  const root = document.getElementById("hostRoot");
  const modalRoot = document.getElementById("modalRoot");
  const toastContainer = document.getElementById("toastContainer");
  const rankDrawer = document.getElementById("rankDrawer");

  const OPT_COLORS = ["#2563eb", "#0d9488", "#d97706", "#9333ea"];

  function fmtScore(val) {
    const num = Number(val || 0);
    return Number.isFinite(num) ? num.toFixed(1) : "0.0";
  }

  const app = {
    view: "library", // library | editor | room
    sets: [],
    serverInfo: { lanIps: [] },
    editSet: null,
    editQIndex: 0,
    roomCode: null,
    hostToken: null,
    roomState: null,
    customJoinBaseUrl: "",
    sse: null,
    pollTimer: null,
    countdownTimer: null,
    localRemaining: null,
    showMiniQr: false,
    lastSeenRankSeq: 0,
    rankDrawerTimer: null,
    rankDrawerHover: false,
    podiumRevealedKey: null,
    podiumTimers: [],
    confettiRaf: null,
    prevRaceSnapshot: new Map(),
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
    if (!res.ok) throw new Error(data.error || `Lỗi kết nối (${res.status})`);
    return data;
  }

  // =========================================================================
  // MAIN-WEBSITE MODAL SYSTEM (matches edu-exam-2025 .modal-card + Animate UI Dialog)
  // =========================================================================
  let lgModalCloseTimer = null;

  function closeModal() {
    const backdrop = document.getElementById("lgModalBackdrop");
    if (!backdrop) {
      modalRoot.innerHTML = "";
      return;
    }
    if (lgModalCloseTimer) {
      clearTimeout(lgModalCloseTimer);
      lgModalCloseTimer = null;
    }
    const rm = Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    backdrop.classList.remove("is-open");
    backdrop.classList.add("is-closing");
    if (rm) {
      modalRoot.innerHTML = "";
    } else {
      lgModalCloseTimer = setTimeout(() => {
        lgModalCloseTimer = null;
        modalRoot.innerHTML = "";
      }, 210);
    }
  }

  function openModal({ title, iconName = "", bodyHtml, footerHtml = "", wide = false, onMount }) {
    if (lgModalCloseTimer) {
      clearTimeout(lgModalCloseTimer);
      lgModalCloseTimer = null;
    }
    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="lgModalBackdrop" role="dialog" aria-modal="true">
        <div class="modal-card ${wide ? "modal-wide" : ""}">
          <div class="modal-header">
            <h3>${iconName ? icon(iconName, 18) : ""}<span>${escapeHtml(title)}</span></h3>
            <button type="button" class="icon-btn" id="lgModalCloseBtn" aria-label="Đóng">${icon("close", 18)}</button>
          </div>
          <div class="modal-body">${bodyHtml}</div>
          ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ""}
        </div>
      </div>
    `;
    const backdrop = document.getElementById("lgModalBackdrop");
    document.getElementById("lgModalCloseBtn").onclick = closeModal;
    backdrop.onclick = (e) => {
      if (e.target.id === "lgModalBackdrop") closeModal();
    };
    if (typeof onMount === "function") onMount();
    void backdrop.offsetWidth;
    backdrop.classList.add("is-open");
  }

  function openConfirmModal({ title, message, confirmLabel = "Xác nhận", cancelLabel = "Hủy", danger = false, iconName = "alertCircle", onConfirm }) {
    openModal({
      title,
      iconName,
      bodyHtml: `<p style="margin:0; color:var(--text); line-height:1.6;">${message}</p>`,
      footerHtml: `
        <button type="button" class="btn btn-outline" id="btnConfirmCancel">${escapeHtml(cancelLabel)}</button>
        <button type="button" class="btn ${danger ? "btn-danger" : "btn-primary"}" id="btnConfirmOk">${escapeHtml(confirmLabel)}</button>
      `,
      onMount: () => {
        document.getElementById("btnConfirmCancel").onclick = closeModal;
        document.getElementById("btnConfirmOk").onclick = async () => {
          closeModal();
          await onConfirm?.();
        };
      },
    });
  }

  function openPromptModal({ title, label, value = "", placeholder = "", confirmLabel = "Lưu", onSubmit }) {
    openModal({
      title,
      iconName: "settings",
      bodyHtml: `
        <label class="field-label">${escapeHtml(label)}</label>
        <input id="lgPromptInput" class="input" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" />
      `,
      footerHtml: `
        <button type="button" class="btn btn-outline" id="btnPromptCancel">Hủy</button>
        <button type="button" class="btn btn-primary" id="btnPromptOk">${escapeHtml(confirmLabel)}</button>
      `,
      onMount: () => {
        const inp = document.getElementById("lgPromptInput");
        inp.focus();
        inp.select();
        document.getElementById("btnPromptCancel").onclick = closeModal;
        const submit = () => {
          const v = inp.value.trim();
          closeModal();
          onSubmit?.(v);
        };
        document.getElementById("btnPromptOk").onclick = submit;
        inp.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } };
      },
    });
  }

  // =========================================================================
  // RIGHT-EDGE SLIDE-IN LEADERBOARD DELTA POPUP
  // =========================================================================
  function hideRankDrawer() {
    if (app.rankDrawerTimer) {
      clearTimeout(app.rankDrawerTimer);
      app.rankDrawerTimer = null;
    }
    rankDrawer.classList.remove("is-open");
  }

  function scheduleRankDrawerClose(ms = 2800) {
    if (app.rankDrawerTimer) clearTimeout(app.rankDrawerTimer);
    const bar = rankDrawer.querySelector(".rank-drawer-timer-bar");
    if (bar) {
      bar.style.transition = "none";
      bar.style.transform = "scaleX(1)";
      requestAnimationFrame(() => {
        bar.style.transition = `transform ${ms}ms linear`;
        bar.style.transform = "scaleX(0)";
      });
    }
    app.rankDrawerTimer = setTimeout(() => {
      if (!app.rankDrawerHover) hideRankDrawer();
    }, ms);
  }

  function showRankChangeDrawer(st) {
    if (!st.settings?.scoringEnabled) return;
    const rows = (st.rankChanges || []).slice(0, 6);
    if (!rows.length) return;

    const reasonText =
      st.lastRankChangeReason === "all_submitted"
        ? "Tất cả học sinh đã nộp bài"
        : "Đã tổng kết câu hỏi";

    rankDrawer.innerHTML = `
      <div class="rank-drawer-head">
        <div style="display:flex; align-items:center; gap:9px; min-width:0;">
          ${icon("trophy", 19)}
          <div style="min-width:0;">
            <div style="font-weight:800; font-size:0.94rem; line-height:1.2;">Biến động Bảng xếp hạng</div>
            <div style="font-size:0.75rem; opacity:0.86;">${escapeHtml(reasonText)}</div>
          </div>
        </div>
        <button type="button" class="icon-btn" id="btnCloseRankDrawer" style="color:#fff;" aria-label="Đóng">${icon("close", 16)}</button>
      </div>
      <div class="rank-drawer-body">
        ${rows
          .map((r) => {
            const deltaCls = r.rankDelta > 0 ? "up" : r.rankDelta < 0 ? "down" : "same";
            const deltaHtml =
              r.rankDelta > 0
                ? `${icon("arrowUp", 12)}+${r.rankDelta}`
                : r.rankDelta < 0
                  ? `${icon("arrowDown", 12)}${r.rankDelta}`
                  : "—";
            return `
              <div class="rank-delta-row ${r.rank === 1 ? "top-1" : ""}">
                <span style="font-family:var(--font-mono); font-weight:800; width:24px; color:var(--primary);">#${r.rank}</span>
                ${avatarBadge(r.name, r.avatar, 28)}
                <div style="min-width:0; flex:1;">
                  <div style="font-weight:700; font-size:0.86rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(r.name)}</div>
                  <div style="font-size:0.74rem; color:var(--success); font-weight:700;">
                    ${r.pointsGained > 0 ? `+${fmtScore(r.pointsGained)} đ câu này` : "0.0 đ câu này"}
                  </div>
                </div>
                <span class="rank-delta-badge ${deltaCls}">${deltaHtml}</span>
                <span style="font-family:var(--font-mono); font-weight:800; font-size:0.88rem; color:var(--text); min-width:44px; text-align:right;">${fmtScore(r.score)}</span>
              </div>
            `;
          })
          .join("")}
      </div>
      <div class="rank-drawer-timer"><div class="rank-drawer-timer-bar"></div></div>
    `;

    document.getElementById("btnCloseRankDrawer").onclick = hideRankDrawer;
    rankDrawer.onmouseenter = () => {
      app.rankDrawerHover = true;
      if (app.rankDrawerTimer) clearTimeout(app.rankDrawerTimer);
      const bar = rankDrawer.querySelector(".rank-drawer-timer-bar");
      if (bar) bar.style.transition = "none";
    };
    rankDrawer.onmouseleave = () => {
      app.rankDrawerHover = false;
      scheduleRankDrawerClose(1200);
    };

    requestAnimationFrame(() => {
      rankDrawer.classList.add("is-open");
      scheduleRankDrawerClose(2800);
    });
  }

  // =========================================================================
  // URL HELPERS & INIT
  // =========================================================================
  function getJoinBaseUrl() {
    if (app.customJoinBaseUrl.trim()) {
      return app.customJoinBaseUrl.trim().replace(/\/+$/, "");
    }
    const loc = window.location;
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

    document.getElementById("btnHomeBrand")?.addEventListener("click", () => {
      if (app.view === "room") promptCloseRoomAndExit();
      else goLibrary();
    });
    document.getElementById("btnTopLibrary")?.addEventListener("click", () => {
      if (app.view === "room") promptCloseRoomAndExit();
      else goLibrary();
    });

    // Click anywhere outside the slide-in BXH drawer -> smoothly retract it!
    document.addEventListener("pointerdown", (e) => {
      if (rankDrawer.classList.contains("is-open") && !rankDrawer.contains(e.target)) {
        hideRankDrawer();
      }
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modalRoot.innerHTML) {
        closeModal();
        return;
      }
      if (app.view !== "room" || !app.roomState || modalRoot.innerHTML) return;
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (app.roomState.phase === "lobby") sendAction("start");
        else if (app.roomState.phase !== "finished") sendAction("next");
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

  function clearPodiumEffects() {
    app.podiumTimers.forEach((t) => clearTimeout(t));
    app.podiumTimers = [];
    if (app.confettiRaf) {
      cancelAnimationFrame(app.confettiRaf);
      app.confettiRaf = null;
    }
  }

  function disconnectRoomStreams() {
    hideRankDrawer();
    clearPodiumEffects();
    if (app.sse) { app.sse.close(); app.sse = null; }
    if (app.pollTimer) { clearInterval(app.pollTimer); app.pollTimer = null; }
    if (app.countdownTimer) { clearInterval(app.countdownTimer); app.countdownTimer = null; }
  }

  function openQrLightbox() {
    const st = app.roomState;
    if (!st) return;
    const joinUrl = getJoinUrl();
    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="qrLightboxBackdrop" role="dialog" aria-modal="true">
        <div class="qr-lightbox-card">
          <button type="button" class="icon-btn" id="btnCloseQrLightbox" style="position:absolute; top:16px; right:16px;" aria-label="Đóng">${icon("close", 20)}</button>
          <div style="font-size:0.86rem; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:var(--text-muted);">Quét mã QR để tham gia phòng chơi</div>
          <div class="qr-lightbox-code">${escapeHtml(st.code)}</div>
          <div class="qr-lightbox-svg" id="qrLightboxSvgBox"></div>
          <div style="margin-top:14px; font-family:var(--font-mono); font-size:0.88rem; color:var(--text-secondary); word-break:break-all;">${escapeHtml(joinUrl)}</div>
          <div style="display:flex; align-items:center; justify-content:center; gap:10px; margin-top:16px; flex-wrap:wrap;">
            <span class="badge badge-success" style="font-size:0.9rem; padding:6px 12px;" id="qrLightboxCount">${icon("users", 14)} ${st.playerCount} học sinh đã vào phòng</span>
            <button type="button" class="btn btn-soft btn-sm" id="btnLightboxCopy">${icon("copy", 14)} Sao chép link</button>
          </div>
        </div>
      </div>
    `;
    const qrSize = Math.min(390, Math.max(260, window.innerWidth - 130));
    window.LiveQR.renderSvg(document.getElementById("qrLightboxSvgBox"), joinUrl, qrSize);
    document.getElementById("btnCloseQrLightbox").onclick = closeModal;
    document.getElementById("qrLightboxBackdrop").onclick = (e) => {
      if (e.target.id === "qrLightboxBackdrop") closeModal();
    };
    document.getElementById("btnLightboxCopy").onclick = async () => {
      try {
        await navigator.clipboard.writeText(joinUrl);
        toast("Đã sao chép đường dẫn phòng chơi!", "success");
      } catch (_) {
        toast(joinUrl);
      }
    };
  }

  async function goLibrary() {
    disconnectRoomStreams();
    app.roomCode = null;
    app.hostToken = null;
    app.roomState = null;
    app.view = "library";
    try {
      const setsRes = await api("/api/live/sets");
      app.sets = setsRes.sets || [];
    } catch (_) {}
    render();
  }

  function promptCloseRoomAndExit() {
    openConfirmModal({
      title: "Thoát khỏi phòng chơi?",
      iconName: "logout",
      message: "Khi thoát, phòng chơi sẽ được đóng lại và <strong>tất cả điện thoại học sinh đang kết nối sẽ nhận thông báo kết thúc ngay lập tức</strong>.",
      confirmLabel: "Thoát & Đóng phòng",
      cancelLabel: "Ở lại phòng",
      danger: true,
      onConfirm: async () => {
        try {
          if (app.roomCode && app.hostToken) {
            await api(`/api/live/rooms/${app.roomCode}/action`, {
              method: "POST",
              body: JSON.stringify({ hostToken: app.hostToken, action: "close_room" }),
            });
          }
        } catch (_) {}
        toast("Đã đóng phòng chơi và gửi thông báo tới học sinh.");
        goLibrary();
      },
    });
  }

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
                  <button class="btn btn-primary" data-launch="${escapeHtml(s.id)}">${icon("play", 16)} Mở phòng chơi (QR)</button>
                  <div style="display:flex; gap:6px;">
                    <button class="btn btn-outline btn-sm" data-edit="${escapeHtml(s.id)}">${icon("edit", 14)} Sửa</button>
                    <button class="btn btn-outline btn-sm" data-dup="${escapeHtml(s.id)}">${icon("copy", 14)} Nhân bản</button>
                    <button class="btn btn-ghost btn-sm" style="color:var(--danger);" data-del="${escapeHtml(s.id)}" title="Xóa">${icon("trash", 15)}</button>
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
          <p>4 chế độ trên cùng bộ câu hỏi: <strong>Gỡ Bom Mảnh Ghép</strong>, <strong>Ma Sói Toán Học</strong>, <strong>Cầu Kính Sinh Tử</strong> và <strong>Đấu Trường Tốc Độ</strong>.</p>
        </div>
        <div class="hero-actions">
          <button class="btn btn-white btn-lg" id="btnOpenImport">${icon("upload", 18)} Nhập Excel / CSV</button>
          <button class="btn btn-glass btn-lg" id="btnNewSet">${icon("plus", 18)} Soạn bộ câu hỏi mới</button>
        </div>
      </section>

      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; flex-wrap:wrap; gap:10px;">
        <h2 style="margin:0; font-size:1.16rem;">Kho bộ câu hỏi (${app.sets.length})</h2>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <a class="btn btn-outline btn-sm" href="/api/live/template/xlsx">${icon("download", 15)} Tải file mẫu Excel (.xlsx)</a>
          <a class="btn btn-outline btn-sm" href="/api/live/template/csv">${icon("download", 15)} Tải file mẫu CSV</a>
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
      btn.onclick = () => openModePickerModal(btn.dataset.launch);
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
      btn.onclick = () => {
        openConfirmModal({
          title: "Xóa bộ câu hỏi?",
          iconName: "trash",
          message: "Bộ câu hỏi này sẽ bị xóa vĩnh viễn khỏi danh sách. Bạn có chắc muốn tiếp tục?",
          confirmLabel: "Xóa bộ câu hỏi",
          danger: true,
          onConfirm: async () => {
            try {
              await api(`/api/live/sets/${btn.dataset.del}`, { method: "DELETE" });
              toast("Đã xóa bộ câu hỏi.", "success");
              goLibrary();
            } catch (err) {
              toast(err.message, "error");
            }
          },
        });
      };
    });
  }

  // =========================================================================
  // IMPORT EXCEL / CSV / JSON MODAL (main-site .modal-card style)
  // =========================================================================
  function openImportModal() {
    openModal({
      title: "Nhập bộ câu hỏi từ Excel / CSV / JSON",
      iconName: "upload",
      wide: true,
      bodyHtml: `
        <p style="margin:0 0 14px; font-size:0.9rem; color:var(--text-secondary);">
          Hỗ trợ trực tiếp file <strong>.xlsx</strong> (Excel/Google Sheets), <strong>.csv</strong> và <strong>.json</strong> với đủ 6 dạng câu hỏi và công thức toán KaTeX <code>$...$</code>.
        </p>
        <div style="display:flex; gap:8px; margin-bottom:16px; flex-wrap:wrap;">
          <a class="btn btn-soft btn-sm" href="/api/live/template/xlsx">${icon("download", 15)} Tải file Excel mẫu (.xlsx)</a>
          <a class="btn btn-outline btn-sm" href="/api/live/template/csv">${icon("download", 15)} Tải file CSV mẫu (.csv)</a>
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
          <div class="icon-emblem" style="width:48px; height:48px; border-radius:14px; margin-bottom:8px;">${icon("fileText", 22)}</div>
          <div style="font-weight:700; color:var(--primary);">Kéo thả file Excel (.xlsx), CSV hoặc JSON vào đây</div>
          <div style="font-size:0.84rem; color:var(--text-muted); margin-top:4px;">hoặc bấm để chọn tệp từ máy tính</div>
          <input type="file" id="impFileInput" accept=".xlsx,.csv,.json,.txt" class="hidden" />
        </div>
        <div id="impStatus" style="margin-top:12px; font-size:0.88rem;"></div>
      `,
      footerHtml: `<button type="button" class="btn btn-outline" id="btnImpCancel">Đóng</button>`,
      onMount: () => {
        document.getElementById("btnImpCancel").onclick = closeModal;
        const dz = document.getElementById("impDropzone");
        const fi = document.getElementById("impFileInput");
        dz.onclick = () => fi.click();
        dz.ondragover = (e) => { e.preventDefault(); dz.classList.add("dragover"); };
        dz.ondragleave = () => dz.classList.remove("dragover");
        dz.ondrop = (e) => {
          e.preventDefault();
          dz.classList.remove("dragover");
          if (e.dataTransfer.files && e.dataTransfer.files[0]) handleImportFile(e.dataTransfer.files[0]);
        };
        fi.onchange = () => {
          if (fi.files && fi.files[0]) handleImportFile(fi.files[0]);
        };
      },
    });
  }

  function handleImportFile(file) {
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
        closeModal();
        if (res.warnings && res.warnings.length) {
          openModal({
            title: "Lưu ý sau khi nhập dữ liệu",
            iconName: "alertCircle",
            bodyHtml: `<ul style="margin:0; padding-left:18px;">${res.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}</ul>`,
            footerHtml: `<button type="button" class="btn btn-primary" id="btnWarnOk">Đã hiểu</button>`,
            onMount: () => { document.getElementById("btnWarnOk").onclick = closeModal; },
          });
        }
        goLibrary();
      } catch (err) {
        statusEl.innerHTML = `<span style="color:var(--danger); font-weight:600;">${escapeHtml(err.message)}</span>`;
      }
    };
    reader.readAsDataURL(file);
  }

  // =========================================================================
  // VIEW 2: VISUAL QUESTION SET EDITOR
  // =========================================================================
  function createBlankQuestion(type) {
    const id = "q-" + Math.random().toString(36).slice(2, 9);
    const base = { id, type, prompt: "", image: "", timeLimit: 30, points: 20, explanation: "", data: {} };
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
          <button class="btn btn-outline btn-sm" id="btnEdBack">${icon("back", 15)} Quay lại thư viện</button>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn btn-outline" id="btnEdSave">${icon("save", 16)} Lưu bộ câu hỏi</button>
            <button class="btn btn-primary" id="btnEdSaveLaunch">${icon("play", 16)} Lưu &amp; Mở phòng chơi</button>
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
            <button class="btn btn-soft btn-sm" data-add-type="mcq">${icon("plus", 13)} Trắc nghiệm</button>
            <button class="btn btn-soft btn-sm" data-add-type="true_false">${icon("plus", 13)} Đúng / Sai</button>
            <button class="btn btn-soft btn-sm" data-add-type="short_answer">${icon("plus", 13)} Trả lời ngắn</button>
            <button class="btn btn-soft btn-sm" data-add-type="fill_blank">${icon("plus", 13)} Điền chỗ trống</button>
            <button class="btn btn-soft btn-sm" data-add-type="drag_order">${icon("plus", 13)} Sắp xếp</button>
            <button class="btn btn-soft btn-sm" data-add-type="drag_match">${icon("plus", 13)} Ghép đôi</button>
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
            <label class="field-label" style="margin:0;">Các mệnh đề Đúng / Sai (1 mệnh đề để trống text sẽ dùng trực tiếp câu hỏi; hoặc 2–4 ý a,b,c,d)</label>
            <button class="btn btn-soft btn-sm" id="btnAddTfStmt">${icon("plus", 14)} Thêm mệnh đề</button>
          </div>
          ${stmts.map((st, i) => `
            <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
              <span class="badge badge-purple">${String.fromCharCode(97 + i)})</span>
              <input class="input" data-tf-text="${i}" value="${escapeHtml(st.text || "")}" placeholder="Nội dung mệnh đề ${String.fromCharCode(97 + i)}..." />
              <select class="select" style="width:120px;" data-tf-ans="${i}">
                <option value="true" ${st.answer ? "selected" : ""}>Đúng</option>
                <option value="false" ${!st.answer ? "selected" : ""}>Sai</option>
              </select>
              ${stmts.length > 1 ? `<button class="icon-btn" data-tf-del="${i}" style="color:var(--danger);">${icon("close", 15)}</button>` : ""}
            </div>
          `).join("")}
        </div>
      `;
    } else if (q.type === "short_answer") {
      typeFieldsHtml = `
        <div style="margin-top:16px;" class="form-grid-2">
          <div>
            <label class="field-label">Đáp án chấp nhận (cách nhau dấu <code>|</code>)</label>
            <input class="input" id="edShortAcc" value="${escapeHtml((q.data.acceptedAnswers || []).join(" | "))}" placeholder="Ví dụ: 3,5 | 3.5 | 7/2" />
          </div>
          <div>
            <label class="field-label">Gợi ý ô nhập cho học sinh</label>
            <input class="input" id="edShortPh" value="${escapeHtml(q.data.placeholder || "")}" placeholder="Nhập đáp án..." />
          </div>
        </div>
      `;
    } else if (q.type === "fill_blank") {
      let editableTpl = q.data.template || "";
      (q.data.blanks || []).forEach((b, i) => {
        editableTpl = editableTpl.replace(`{{${i}}}`, `{{${(b.accepted || [""]).join("|")}}}`);
      });
      typeFieldsHtml = `
        <div style="margin-top:16px;">
          <label class="field-label">Đoạn văn có chỗ trống (bọc đáp án đúng trong <code>{{đáp án}}</code>)</label>
          <textarea class="textarea" id="edClozeTpl">${escapeHtml(editableTpl)}</textarea>
          <div style="margin-top:10px;">
            <label class="field-label">Ngân hàng từ kéo thả (cách nhau dấu <code>|</code> — để trống nếu tự gõ)</label>
            <input class="input" id="edClozeWb" value="${escapeHtml((q.data.wordBank || []).join(" | "))}" placeholder="Ví dụ: -1 | 1 | 2 | -2 | 0" />
          </div>
        </div>
      `;
    } else if (q.type === "drag_order") {
      const items = q.data.items || ["", ""];
      typeFieldsHtml = `
        <div style="margin-top:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <label class="field-label" style="margin:0;">Các bước theo ĐÚNG THỨ TỰ (tự xáo trộn khi gửi cho học sinh)</label>
            <button class="btn btn-soft btn-sm" id="btnAddOrderItem">${icon("plus", 14)} Thêm mục</button>
          </div>
          ${items.map((it, i) => `
            <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
              <span class="badge badge-indigo">Bước ${i + 1}</span>
              <input class="input" data-ord-item="${i}" value="${escapeHtml(it)}" />
              ${items.length > 2 ? `<button class="icon-btn" data-ord-del="${i}" style="color:var(--danger);">${icon("close", 15)}</button>` : ""}
            </div>
          `).join("")}
        </div>
      `;
    } else if (q.type === "drag_match") {
      const pairs = q.data.pairs || [{ left: "", right: "" }, { left: "", right: "" }];
      typeFieldsHtml = `
        <div style="margin-top:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <label class="field-label" style="margin:0;">Các cặp ghép ĐÚNG (cột phải tự xáo trộn trên điện thoại học sinh)</label>
            <button class="btn btn-soft btn-sm" id="btnAddMatchPair">${icon("plus", 14)} Thêm cặp</button>
          </div>
          ${pairs.map((p, i) => `
            <div style="display:grid; grid-template-columns:1fr 24px 1fr auto; gap:8px; align-items:center; margin-bottom:8px;">
              <input class="input" data-match-left="${i}" value="${escapeHtml(p.left)}" placeholder="Vế trái ${i + 1}" />
              <div style="text-align:center; color:var(--text-muted);">${icon("link", 15)}</div>
              <input class="input" data-match-right="${i}" value="${escapeHtml(p.right)}" placeholder="Vế phải tương ứng ${i + 1}" />
              ${pairs.length > 2 ? `<button class="icon-btn" data-match-del="${i}" style="color:var(--danger);">${icon("close", 15)}</button>` : ""}
            </div>
          `).join("")}
        </div>
      `;
    }

    wrap.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:14px;">
        <span class="badge badge-${meta.color}">Câu ${idx + 1}: ${meta.label}</span>
        <div style="display:flex; gap:6px;">
          <button class="btn btn-outline btn-sm" id="btnQMoveUp" ${idx === 0 ? "disabled" : ""}>${icon("arrowUp", 14)}</button>
          <button class="btn btn-outline btn-sm" id="btnQMoveDown" ${idx === total - 1 ? "disabled" : ""}>${icon("arrowDown", 14)}</button>
          <button class="btn btn-ghost btn-sm" style="color:var(--danger);" id="btnQDelete" ${total <= 1 ? "disabled" : ""}>${icon("trash", 14)} Xóa câu</button>
        </div>
      </div>

      <div class="form-grid-2" style="margin-bottom:14px;">
        <div>
          <label class="field-label">Thời gian trả lời (giây, nhập 0 = không giới hạn)</label>
          <input type="number" min="0" max="600" id="edQTime" class="input" value="${q.timeLimit ?? 30}" />
        </div>
        <div>
          <label class="field-label">Thang điểm tự động</label>
          <div class="input" style="background:var(--surface-subtle); color:var(--text-secondary); font-weight:600;">
            Đúng nhanh nhất: 20.0 đ → chậm nhất: 10.0 đ
          </div>
        </div>
      </div>

      <div>
        <label class="field-label">Nội dung câu hỏi (hỗ trợ công thức toán KaTeX <code>$...$</code> và <code>$$...$$</code>)</label>
        <textarea id="edQPrompt" class="textarea">${escapeHtml(q.prompt)}</textarea>
        <div class="math-preview-box" id="edQPromptPreview"></div>
      </div>

      ${typeFieldsHtml}

      <div style="margin-top:18px;">
        <label class="field-label" style="display:flex; align-items:center; gap:6px;">${icon("bulb", 15)} Nội dung Giải thích của Giáo viên</label>
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
    document.getElementById("edQPrompt").oninput = (e) => { q.prompt = e.target.value; updatePreview("edQPromptPreview", q.prompt); };
    document.getElementById("edQExpl").oninput = (e) => { q.explanation = e.target.value; updatePreview("edQExplPreview", q.explanation); };

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

    if (q.type === "mcq") {
      wrap.querySelectorAll('input[name="mcqCorrect"]').forEach((r) => { r.onchange = () => { q.data.correctIndex = Number(r.value); }; });
      wrap.querySelectorAll("[data-mcq-opt]").forEach((inp) => { inp.oninput = () => { q.data.options[Number(inp.dataset.mcqOpt)] = inp.value; }; });
    } else if (q.type === "true_false") {
      document.getElementById("btnAddTfStmt").onclick = () => { q.data.statements.push({ text: "", answer: true }); renderEditor(); };
      wrap.querySelectorAll("[data-tf-text]").forEach((inp) => { inp.oninput = () => { q.data.statements[Number(inp.dataset.tfText)].text = inp.value; }; });
      wrap.querySelectorAll("[data-tf-ans]").forEach((sel) => { sel.onchange = () => { q.data.statements[Number(sel.dataset.tfAns)].answer = sel.value === "true"; }; });
      wrap.querySelectorAll("[data-tf-del]").forEach((btn) => { btn.onclick = () => { q.data.statements.splice(Number(btn.dataset.tfDel), 1); renderEditor(); }; });
    } else if (q.type === "short_answer") {
      document.getElementById("edShortAcc").oninput = (e) => { q.data.acceptedAnswers = e.target.value.split("|").map((s) => s.trim()).filter(Boolean); };
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
      wrap.querySelectorAll("[data-ord-item]").forEach((inp) => { inp.oninput = () => { q.data.items[Number(inp.dataset.ordItem)] = inp.value; }; });
      wrap.querySelectorAll("[data-ord-del]").forEach((btn) => { btn.onclick = () => { q.data.items.splice(Number(btn.dataset.ordDel), 1); renderEditor(); }; });
    } else if (q.type === "drag_match") {
      document.getElementById("btnAddMatchPair").onclick = () => { q.data.pairs.push({ left: "", right: "" }); renderEditor(); };
      wrap.querySelectorAll("[data-match-left]").forEach((inp) => { inp.oninput = () => { q.data.pairs[Number(inp.dataset.matchLeft)].left = inp.value; }; });
      wrap.querySelectorAll("[data-match-right]").forEach((inp) => { inp.oninput = () => { q.data.pairs[Number(inp.dataset.matchRight)].right = inp.value; }; });
      wrap.querySelectorAll("[data-match-del]").forEach((btn) => { btn.onclick = () => { q.data.pairs.splice(Number(btn.dataset.matchDel), 1); renderEditor(); }; });
    }
  }

  async function saveEditedSet(andLaunch) {
    try {
      const set = app.editSet;
      let res;
      if (set.id) res = await api(`/api/live/sets/${set.id}`, { method: "PUT", body: JSON.stringify(set) });
      else res = await api("/api/live/sets", { method: "POST", body: JSON.stringify(set) });
      toast("Đã lưu bộ câu hỏi!", "success");
      if (andLaunch) openModePickerModal(res.set.id);
      else goLibrary();
    } catch (err) {
      toast(err.message, "error");
    }
  }

  // =========================================================================
  // VIEW 3: LIVE ROOM (LOBBY + PROJECTOR STAGE)
  // =========================================================================
  function openModePickerModal(setId, isSwitchingInLobby = false) {
    const modeList = [
      GAME_MODES.bomb_defusal,
      GAME_MODES.math_impostor,
      GAME_MODES.glass_bridge,
      GAME_MODES.classic,
    ];
    const currentMode = isSwitchingInLobby && app.roomState ? app.roomState.gameMode : null;
    openModal({
      title: isSwitchingInLobby ? "Đổi chế độ trò chơi" : "Chọn chế độ chơi cho lớp học",
      iconName: "play",
      wide: true,
      bodyHtml: `
        <p style="margin:0 0 14px; font-size:0.9rem; color:var(--text-secondary);">
          Tất cả chế độ đều chạy trực tiếp trên bộ câu hỏi hiện có của thầy — không cần soạn lại dữ liệu.
        </p>
        <div class="mode-picker-grid">
          ${modeList
            .map(
              (m) => `
              <button type="button" class="mode-pick-card accent-${m.accent} ${currentMode === m.id ? "is-selected" : ""}" data-pick-mode="${m.id}">
                <div class="mode-pick-top">
                  <span class="mode-pick-ico accent-${m.accent}">${icon(m.icon, 24)}</span>
                  <span class="badge badge-${m.accent}">${escapeHtml(m.badge)}</span>
                </div>
                <div class="mode-pick-title">${escapeHtml(m.title)}</div>
                <div class="mode-pick-desc">${escapeHtml(m.desc)}</div>
              </button>
            `
            )
            .join("")}
        </div>
      `,
      footerHtml: `<button type="button" class="btn btn-outline" id="btnCancelModePick">Đóng</button>`,
      onMount: () => {
        document.getElementById("btnCancelModePick").onclick = closeModal;
        document.querySelectorAll("[data-pick-mode]").forEach((card) => {
          card.onclick = () => {
            const chosen = card.dataset.pickMode;
            closeModal();
            if (isSwitchingInLobby) {
              sendAction("set_mode", { gameMode: chosen });
            } else {
              launchRoom(setId, chosen);
            }
          };
        });
      },
    });
  }

  async function launchRoom(setId, gameMode = "classic") {
    try {
      const res = await api("/api/live/rooms", {
        method: "POST",
        body: JSON.stringify({
          setId,
          gameMode,
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
      app.lastSeenRankSeq = res.state.rankChangeSeq || 0;
      app.podiumRevealedKey = null;
      app.view = "room";
      connectHostStream();
      render();
      const gm = GAME_MODES[gameMode] || GAME_MODES.classic;
      toast(`Đã mở phòng ${res.roomCode} (${gm.title})!`, "success");
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
      try { applyRoomState(JSON.parse(ev.data)); } catch (_) {}
    });
    app.sse = es;

    app.pollTimer = setInterval(async () => {
      if (app.view !== "room" || !app.roomCode) return;
      try {
        const st = await api(`/api/live/rooms/${app.roomCode}/host?token=${encodeURIComponent(app.hostToken)}`);
        if (!app.roomState || st.version !== app.roomState.version) applyRoomState(st);
      } catch (_) {}
    }, 3200);

    app.countdownTimer = setInterval(() => {
      if (app.view !== "room" || !app.roomState) return;
      if (!["answering", "bridge_debate", "impostor_vote"].includes(app.roomState.phase)) return;
      if (app.localRemaining === null) return;
      app.localRemaining = Math.max(0, +(app.localRemaining - 0.5).toFixed(1));
      const badge = document.getElementById("liveTimerBadge");
      if (badge) {
        const sec = Math.ceil(app.localRemaining);
        badge.innerHTML = `${icon("clock", 18)} <span>${sec > 0 ? `${sec}s` : "Hết giờ"}</span>`;
        badge.classList.toggle("urgent", sec <= 5);
      }
    }, 500);
  }

  function applyRoomState(next) {
    const prev = app.roomState;
    const prevPhase = prev ? prev.phase : null;
    const prevQ = prev ? prev.questionIndex : -1;
    const prevExpl = prev ? prev.showExplanation : false;
    const prevSub = prev && prev.analytics ? prev.analytics.totalSubmitted : -1;

    app.roomState = next;
    app.localRemaining = next.remainingSeconds;

    // Keep giant QR lightbox live student count updated without closing it!
    const lbCount = document.getElementById("qrLightboxCount");
    if (lbCount) {
      lbCount.innerHTML = `${icon("users", 14)} ${next.playerCount} học sinh đã vào phòng`;
    }

    // Trigger slide-in BXH delta popup when all students submitted OR host clicked Kết thúc!
    if ((next.rankChangeSeq || 0) > app.lastSeenRankSeq) {
      app.lastSeenRankSeq = next.rankChangeSeq;
      if (next.phase === "review") {
        showRankChangeDrawer(next);
      }
    }

    // 60fps smooth CSS Grid 1fr <-> 0fr toggle when opening/closing Lời giải!
    const nextSub = next.analytics ? next.analytics.totalSubmitted : -1;
    if (
      prev &&
      prevPhase === "review" &&
      next.phase === "review" &&
      prevQ === next.questionIndex &&
      prevSub === nextSub &&
      prevExpl !== next.showExplanation
    ) {
      const card = document.getElementById("analyticsCardRoot");
      if (card) {
        card.querySelectorAll(".mcq-bar-slot[data-is-correct='0']").forEach((slot) => {
          slot.classList.toggle("is-collapsed-wrong", Boolean(next.showExplanation));
        });
        const explSlot = document.getElementById("inlineExplSlot");
        if (explSlot) {
          explSlot.classList.toggle("is-open", Boolean(next.showExplanation));
        }
        const bulbBtn = document.querySelector('.dock-icon-btn[data-act="toggle_explanation"]');
        if (bulbBtn) {
          bulbBtn.classList.toggle("is-active", Boolean(next.showExplanation));
          bulbBtn.setAttribute("data-tip", next.showExplanation ? "Ẩn lời giải (E)" : "Lời giải (E)");
        }
        return;
      }
    }

    renderRoom();
  }

  async function sendAction(action, extra = {}) {
    if (!app.roomCode || !app.hostToken) return;
    if (action === "next" || action === "goto" || action === "start" || action === "finish" || action === "show_leaderboard") {
      hideRankDrawer();
    }
    if (action === "start") {
      app.podiumRevealedKey = null;
      clearPodiumEffects();
    }
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
              ${avatarBadge(p.name, p.avatar, 26)}
              <span>${escapeHtml(p.name)}</span>
              ${p.className ? `<span style="font-size:0.76rem; color:var(--text-muted);">(${escapeHtml(p.className)})</span>` : ""}
              <button class="kick-btn" data-kick="${escapeHtml(p.id)}" title="Mời ra khỏi phòng">${icon("close", 13)}</button>
            </div>
          `
          )
          .join("")
      : `<div style="color:var(--text-muted); padding:28px 10px; text-align:center; width:100%;">
          Chưa có học sinh nào vào phòng.<br>
          Hãy chiếu màn hình này lên bảng để học sinh quét mã QR, hoặc bấm <strong>"+40 HS ảo"</strong> để chạy thử ngay.
        </div>`;

    const gm = GAME_MODES[st.gameMode] || GAME_MODES.classic;
    const bombSquadsLobbyHtml =
      st.gameMode === "bomb_defusal" && st.modeData?.squads?.length
        ? `
          <div class="card">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px; flex-wrap:wrap;">
              <h3 style="margin:0; font-size:0.98rem; display:inline-flex; align-items:center; gap:7px;">${icon("shield", 16)} Phân đội Gỡ Bom (${st.modeData.squads.length} đội)</h3>
              <button type="button" class="btn btn-outline btn-sm" id="btnShuffleSquads">${icon("refresh", 14)} Trộn lại đội</button>
            </div>
            <div class="lobby-squads-grid">
              ${st.modeData.squads
                .map(
                  (sq) => `
                  <div class="lobby-squad-card">
                    <div style="font-weight:800; font-size:0.86rem; color:var(--primary); margin-bottom:6px;">${escapeHtml(sq.name)} (${sq.members.length})</div>
                    <div style="display:flex; flex-wrap:wrap; gap:5px;">
                      ${sq.members.map((m) => `<span class="badge badge-blue" style="font-weight:600;">${escapeHtml(m.name)}</span>`).join("") || '<span style="font-size:0.78rem; color:var(--text-muted);">Chưa có HS</span>'}
                    </div>
                  </div>
                `
                )
                .join("")}
            </div>
          </div>
        `
        : "";

    root.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; flex-wrap:wrap; gap:10px;">
        <div>
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span class="badge badge-blue">${escapeHtml(st.subject || "Phòng chơi trực tiếp")}</span>
            <span class="badge badge-${gm.accent}">${icon(gm.icon, 14)} ${escapeHtml(gm.title)}</span>
            <button type="button" class="btn btn-outline btn-sm" id="btnSwitchModeLobby" style="padding:3px 10px; font-size:0.78rem;">Đổi chế độ</button>
          </div>
          <h1 style="margin:6px 0 0; font-size:1.42rem;">${escapeHtml(st.setTitle)}</h1>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn btn-outline btn-sm" id="btnLobbyExit">${icon("back", 15)} Thoát phòng</button>
          <a class="btn btn-soft btn-sm" href="${escapeHtml(joinUrl)}" target="_blank" rel="noopener">Mở thử tab Học sinh ${icon("externalLink", 14)}</a>
        </div>
      </div>

      <div class="lobby-grid">
        <div>
          <section class="qr-hero-card">
            <div style="font-size:0.86rem; text-transform:uppercase; letter-spacing:0.08em; opacity:0.86; font-weight:700;">Quét mã QR bằng điện thoại</div>
            <div class="room-code-display">${escapeHtml(st.code)}</div>
            <div>
              <div class="qr-frame u478-qr-frame" id="lobbyQrFrame" title="Bấm để phóng to mã QR">
                <span class="u478-corner tl" aria-hidden="true"></span>
                <span class="u478-corner tr" aria-hidden="true"></span>
                <span class="u478-corner bl" aria-hidden="true"></span>
                <span class="u478-corner br" aria-hidden="true"></span>
                <span class="u478-beam" aria-hidden="true"></span>
                <div id="lobbyQrContainer"></div>
                <div class="qr-zoom-overlay">
                  <button type="button" class="qr-zoom-btn" id="btnZoomLobbyQr">${icon("fullscreen", 15)} Phóng to mã QR</button>
                </div>
              </div>
            </div>
            <div class="join-url-pill">${escapeHtml(joinUrl)}</div>
            <div style="display:flex; gap:8px; justify-content:center; margin-top:12px; flex-wrap:wrap;">
              <button class="btn btn-sm u478-copy-btn" style="background:rgba(255,255,255,0.18); color:#fff;" id="btnCopyJoinLink">${icon("copy", 14)} <span>Sao chép link</span></button>
              <button class="btn btn-sm" style="background:rgba(255,255,255,0.18); color:#fff;" id="btnEditJoinDomain">${icon("settings", 14)} Đổi địa chỉ QR</button>
            </div>
          </section>

          <!-- DEV TEST BOTS (xóa khối này khi lên web chính thức) -->
          <div class="dev-bot-box" id="devBotBox">
            <span style="font-size:0.8rem; font-weight:700; color:var(--text-muted);">Mô phỏng test nhanh:</span>
            <div style="display:flex; gap:6px;">
              <button class="btn btn-outline btn-sm" id="btnSim15">${icon("cpu", 14)} +15 HS ảo</button>
              <button class="btn btn-soft btn-sm" id="btnSim40">${icon("cpu", 14)} +40 HS ảo</button>
            </div>
          </div>
        </div>

        <section style="display:flex; flex-direction:column; gap:16px;">
          <button class="btn btn-success" style="width:100%; padding:20px 26px; font-size:1.3rem; font-weight:800; border-radius:18px; letter-spacing:-0.01em;" id="btnStartGame">
            ${icon("play", 22)} Bắt đầu
          </button>

          <div class="card">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
              <h3 style="margin:0; font-size:1.02rem; display:inline-flex; align-items:center; gap:7px;">${icon("users", 17)} Học sinh đã vào phòng</h3>
              <span class="badge badge-success" style="font-size:0.88rem;">${st.playerCount} học sinh</span>
            </div>
            <div class="roster-grid">${playersHtml}</div>
          </div>

          ${bombSquadsLobbyHtml}

          ${lanChips ? `<div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; font-size:0.82rem; color:var(--text-muted);">
            <span>Mạng nội bộ phát hiện:</span> ${lanChips}
          </div>` : ""}
        </section>
      </div>
    `;

    window.LiveQR.renderSvg(document.getElementById("lobbyQrContainer"), joinUrl, 240);
    document.getElementById("lobbyQrFrame").onclick = openQrLightbox;
    document.getElementById("btnZoomLobbyQr").onclick = (e) => { e.stopPropagation(); openQrLightbox(); };

    document.getElementById("btnLobbyExit").onclick = promptCloseRoomAndExit;
    document.getElementById("btnSwitchModeLobby").onclick = () => openModePickerModal(st.setId, true);
    const shufBtn = document.getElementById("btnShuffleSquads");
    if (shufBtn) shufBtn.onclick = () => sendAction("shuffle_squads");
    document.getElementById("btnStartGame").onclick = () => sendAction("start");
    document.getElementById("btnSim15").onclick = () => sendAction("simulate_bots", { count: 15 });
    document.getElementById("btnSim40").onclick = () => sendAction("simulate_bots", { count: 40 });
    document.getElementById("btnCopyJoinLink").onclick = async () => {
      const btn = document.getElementById("btnCopyJoinLink");
      try {
        await navigator.clipboard.writeText(joinUrl);
        if (btn) {
          btn.classList.add("is-copied");
          btn.innerHTML = `<svg class="u478-chk" width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 10.5 L8.2 14.2 L15.5 6.5"/></svg> <span>Đã sao chép!</span>`;
          clearTimeout(btn._ct);
          btn._ct = setTimeout(() => {
            if (!btn.isConnected) return;
            btn.classList.remove("is-copied");
            btn.innerHTML = `${icon("copy", 14)} <span>Sao chép link</span>`;
          }, 1800);
        }
        toast("Đã sao chép đường dẫn phòng chơi!", "success");
      } catch (_) {
        toast(joinUrl);
      }
    };
    document.getElementById("btnEditJoinDomain").onclick = () => {
      openPromptModal({
        title: "Đổi địa chỉ gốc cho mã QR",
        label: "Nhập đường dẫn máy chủ (ví dụ https://lop-toan-thay-hoang.onrender.com hoặc http://192.168.1.10:8085)",
        value: getJoinBaseUrl(),
        confirmLabel: "Cập nhật QR",
        onSubmit: (v) => {
          app.customJoinBaseUrl = v;
          renderRoom();
        },
      });
    };

    root.querySelectorAll("[data-toggle]").forEach((btn) => {
      btn.onclick = () => sendAction("toggle_setting", { key: btn.dataset.toggle });
    });
    root.querySelectorAll("[data-kick]").forEach((btn) => {
      btn.onclick = () => sendAction("kick_player", { playerId: btn.dataset.kick });
    });
    root.querySelectorAll("[data-set-base]").forEach((btn) => {
      btn.onclick = () => { app.customJoinBaseUrl = btn.dataset.setBase; renderRoom(); };
    });
  }

  // =========================================================================
  // LIVE PROJECTOR STAGE
  // =========================================================================
  function renderStage(st) {
    const q = st.question;
    const gm = GAME_MODES[st.gameMode] || GAME_MODES.classic;
    const meta = q ? getTypeMeta(q.type) : getTypeMeta("mcq");
    const analytics = st.analytics || {};
    const totalSub = analytics.totalSubmitted || 0;
    const totalTarget = analytics.totalPlayers || st.playerCount || 0;
    const pctSub = totalTarget > 0 ? Math.min(100, Math.round((totalSub / totalTarget) * 100)) : 0;

    const qOptionsHtml = (st.questionOutline || [])
      .map(
        (item) => `<option value="${item.index}" ${item.index === st.questionIndex ? "selected" : ""}>Câu ${item.index + 1} • ${getTypeMeta(item.type).short}</option>`
      )
      .join("");

    let mainBodyHtml = "";

    if (st.phase === "finished" || st.phase === "leaderboard") {
      mainBodyHtml = renderLeaderboardView(st);
    } else if (st.gameMode === "bomb_defusal" && q) {
      mainBodyHtml = renderBombStage(st, q, analytics);
    } else if (st.gameMode === "math_impostor" && q) {
      mainBodyHtml = renderImpostorStage(st, q, analytics);
    } else if (st.gameMode === "glass_bridge" && q) {
      mainBodyHtml = renderGlassBridgeStage(st, q, analytics);
    } else if (q) {
      const remSec = app.localRemaining === null ? null : Math.ceil(app.localRemaining);
      const timerHtml =
        st.phase === "answering"
          ? `<div class="timer-badge ${remSec !== null && remSec <= 5 ? "urgent" : ""}" id="liveTimerBadge" style="display:inline-flex; align-items:center; gap:6px;">
              ${icon("clock", 18)} <span>${remSec === null ? "Tự do" : remSec > 0 ? `${remSec}s` : "Hết giờ"}</span>
            </div>`
          : "";
      const showAnalytics = st.phase === "review" || st.settings.showLiveChart;

      mainBodyHtml = `
        <section class="stage-question-card">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
            <span class="badge badge-${meta.color}" style="font-size:0.86rem;">Câu ${st.questionIndex + 1} / ${st.totalQuestions} • ${meta.label}</span>
            ${timerHtml}
          </div>

          <div class="stage-prompt" id="stagePromptEl">${formatRichText(q.prompt)}</div>

          <div class="stage-metrics-row">
            <div style="font-weight:800; font-size:0.95rem; color:var(--primary); display:inline-flex; align-items:center; gap:6px;" id="liveSubmittedLabel">
              ${icon("users", 16)} ${totalSub} / ${st.playerCount} học sinh đã nộp (${pctSub}%)
            </div>
            <div class="progress-track">
              <div class="progress-fill" style="width:${pctSub}%;"></div>
            </div>
            ${st.phase === "review" && totalSub > 0 ? `<span class="badge badge-success" style="font-size:0.86rem;">Chính xác TB: ${analytics.avgAccuracyPct}%</span>` : ""}
          </div>
        </section>

        ${showAnalytics ? renderAnalyticsCard(q, analytics, st.revealAnswer, st.showExplanation) : renderHiddenLiveCard(st, totalSub)}
      `;
    }

    root.innerHTML = `
      <div class="stage-header-bar">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <button class="btn btn-outline btn-sm" id="btnStageExit">${icon("back", 15)} Thoát</button>
          <span class="badge badge-blue" style="font-family:var(--font-mono); font-size:0.84rem;">PHÒNG: ${escapeHtml(st.code)}</span>
          <span class="badge badge-${gm.accent}">${icon(gm.icon, 13)} ${escapeHtml(gm.title)}</span>
          <button class="btn btn-soft btn-sm" id="btnToggleMiniQr">${icon("qr", 15)} Mã QR</button>
          <select class="select" id="selJumpQ" style="width:auto; padding:6px 10px; font-size:0.84rem;">
            ${qOptionsHtml}
          </select>
        </div>

        <div style="display:flex; align-items:center; gap:7px; flex-wrap:wrap;">
          <button class="btn btn-outline btn-sm" id="btnOpenPlayersModal">${icon("users", 15)} ${st.playerCount} HS</button>
          <button class="btn btn-outline btn-sm" id="btnFullscreen" title="Toàn màn hình">${icon("fullscreen", 15)}</button>
        </div>
      </div>

      ${app.showMiniQr ? `
        <div class="card" style="margin-bottom:16px; display:flex; align-items:center; gap:20px; flex-wrap:wrap; background:linear-gradient(135deg,#eff6ff,#fff);">
          <div class="qr-frame" id="miniQrFrame" style="margin:0; padding:8px; border-radius:14px; box-shadow:var(--shadow-sm);" title="Bấm để phóng to mã QR">
            <div id="miniQrBox"></div>
            <div class="qr-zoom-overlay" style="border-radius:14px;">
              <button type="button" class="qr-zoom-btn" id="btnZoomMiniQr" style="padding:7px 11px; font-size:0.78rem;">${icon("fullscreen", 13)} Phóng to</button>
            </div>
          </div>
          <div>
            <div style="font-weight:800; font-size:1.06rem;">Học sinh vào muộn có thể quét mã QR này bất cứ lúc nào</div>
            <div style="font-family:var(--font-mono); font-size:1.3rem; font-weight:800; color:var(--primary); margin:4px 0;">Mã phòng: ${escapeHtml(st.code)}</div>
            <div style="font-size:0.85rem; color:var(--text-secondary);">${escapeHtml(getJoinUrl())}</div>
          </div>
          <button class="icon-btn" style="margin-left:auto;" id="btnCloseMiniQr" aria-label="Đóng">${icon("close", 18)}</button>
        </div>
      ` : ""}

      <div id="stageContentRoot">${mainBodyHtml}</div>

      ${renderIconDock(st)}
    `;

    renderMathIn(document.getElementById("stageContentRoot"));

    if (app.showMiniQr) {
      window.LiveQR.renderSvg(document.getElementById("miniQrBox"), getJoinUrl(), 132);
      document.getElementById("btnCloseMiniQr").onclick = () => { app.showMiniQr = false; renderRoom(); };
      document.getElementById("miniQrFrame").onclick = openQrLightbox;
      document.getElementById("btnZoomMiniQr").onclick = (e) => { e.stopPropagation(); openQrLightbox(); };
    }

    if (st.phase === "finished") {
      mountQuizizzFinalPodium(st);
    } else if (st.phase === "leaderboard") {
      mountBarRaceLeaderboard(st);
    }

    document.getElementById("btnStageExit").onclick = promptCloseRoomAndExit;
    document.getElementById("btnToggleMiniQr").onclick = () => { app.showMiniQr = !app.showMiniQr; renderRoom(); };
    document.getElementById("selJumpQ").onchange = (e) => sendAction("goto", { questionIndex: Number(e.target.value) });
    document.getElementById("btnOpenPlayersModal").onclick = () => openPlayersModal(st);
    document.getElementById("btnFullscreen").onclick = () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
    };

    root.querySelectorAll("[data-act]").forEach((btn) => {
      btn.onclick = () => sendAction(btn.dataset.act);
    });
    const extBtn = document.getElementById("btnExtend15");
    if (extBtn) extBtn.onclick = () => sendAction("extend_time", { seconds: 15 });
    const liveChartBtn = document.getElementById("btnToggleLiveChart");
    if (liveChartBtn) liveChartBtn.onclick = () => sendAction("toggle_setting", { key: "showLiveChart" });
  }

  // =========================================================================
  // SPECIALIZED PROJECTOR STAGES FOR THE 3 COLLABORATIVE GAME MODES
  // =========================================================================

  // Shared countdown badge for the 3 collaborative modes (auto-ticked by app.countdownTimer)
  function renderLiveFlipTimerHtml(remSec) {
    return `<div class="timer-badge ${remSec !== null && remSec <= 5 ? "urgent" : ""}" id="liveTimerBadge" style="display:inline-flex; align-items:center; gap:6px;">
      ${icon("clock", 18)} <span>${remSec === null ? "Tự do" : remSec > 0 ? `${remSec}s` : "Hết giờ"}</span>
    </div>`;
  }

  function renderBombStage(st, q, analytics) {
    const remSec = app.localRemaining === null ? null : Math.ceil(app.localRemaining);
    const timerHtml = st.phase === "answering" ? renderLiveFlipTimerHtml(remSec) : "";
    const squads = st.modeData?.squads || [];
    const defusedCnt = squads.filter((s) => s.status === "defused").length;
    const doneCnt = squads.filter((s) => s.status !== "ticking" && s.status !== "idle").length;

    const squadCardsHtml = squads
      .map((sq) => {
        const shieldPips = [0, 1, 2]
          .map(
            (i) =>
              `<span class="bomb-shield-pip ${i < sq.shield ? "is-intact" : "is-broken"}">${icon("shield", 14)}</span>`
          )
          .join("");

        let statusBadge = `<span class="badge badge-amber">${icon("clock", 13)} Đang thảo luận &amp; gỡ dây...</span>`;
        let wireVisual = wireSvg("#f59e0b", false);
        if (sq.status === "defused") {
          statusBadge = `<span class="badge badge-success">${icon("checkCircle", 13)} Đã gỡ thành công (+${fmtScore(sq.pointsEarned)}đ)</span>`;
          wireVisual = wireSvg(sq.cutWireHex || "#059669", true);
        } else if (sq.status === "exploded") {
          statusBadge = `<span class="badge badge-rose">${icon("xCircle", 13)} Cắt nhầm ${escapeHtml(sq.cutWireLabel)} (-1 Khiên)</span>`;
          wireVisual = wireSvg(sq.cutWireHex || "#e11d48", true);
        }

        return `
          <article class="squad-bomb-card status-${sq.status}">
            <div class="squad-bomb-head">
              <div style="display:flex; align-items:center; gap:8px;">
                <span class="bomb-mod-icon">${icon("bombModule", 18)}</span>
                <div>
                  <div style="font-weight:800; font-size:0.98rem;">${escapeHtml(sq.name)}</div>
                  <div style="font-size:0.75rem; color:var(--text-muted);">Thợ cắt dây: <strong>${escapeHtml(sq.cutterName || "...")}</strong></div>
                </div>
              </div>
              <div style="text-align:right;">
                <div class="bomb-shield-row" title="Khiên bảo vệ của đội">${shieldPips}</div>
                <div style="font-family:var(--font-mono); font-weight:800; font-size:0.86rem; color:var(--primary); margin-top:2px;">${fmtScore(sq.score)} đ</div>
              </div>
            </div>
            <div class="squad-wire-box">${wireVisual}</div>
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;">
              ${statusBadge}
              <div style="display:flex; gap:4px;">
                ${sq.members.map((m) => avatarBadge(m.name, m.avatar, 24)).join("")}
              </div>
            </div>
          </article>
        `;
      })
      .join("");

    if (st.phase === "answering") {
      return `
        <section class="stage-question-card bomb-command-banner">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
            <div>
              <span class="badge badge-amber" style="font-size:0.86rem;">${icon("bombModule", 14)} GỠ BOM MẢNH GHÉP • CÂU ${st.questionIndex + 1} / ${st.totalQuestions}</span>
              <h2 style="margin:10px 0 4px; font-size:1.36rem; font-weight:800;">Đề bài &amp; Mã dây đã chia nhỏ về từng máy trong đội!</h2>
              <p style="margin:0; color:var(--text-secondary); font-size:0.94rem;">
                Người giữ đề đọc to bài toán — Người giữ bảng mã đối chiếu màu dây — Báo cho <strong>Thợ Gỡ Bom</strong> dùng kìm cắt đúng sợi dây trước khi hết giờ!
              </p>
            </div>
            ${timerHtml}
          </div>
          <div class="stage-metrics-row">
            <div style="font-weight:800; color:var(--primary); display:inline-flex; align-items:center; gap:6px;">
              ${icon("wireCutter", 16)} Đã cắt dây: ${doneCnt} / ${squads.length} đội
            </div>
            <div class="progress-track">
              <div class="progress-fill" style="width:${squads.length ? Math.round((doneCnt / squads.length) * 100) : 0}%;"></div>
            </div>
            <button class="btn btn-primary" data-act="lock">${icon("checkCircle", 17)} Kết thúc</button>
          </div>
        </section>

        <section class="squads-bomb-grid">${squadCardsHtml}</section>
      `;
    }

    // Review phase: show question + squad results + answer & smooth Lời giải!
    return `
      <section class="stage-question-card">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
          <span class="badge badge-amber" style="font-size:0.86rem;">${icon("bombModule", 14)} Kết quả Gỡ Bom • Câu ${st.questionIndex + 1} / ${st.totalQuestions}</span>
          <span class="badge badge-success" style="font-size:0.88rem;">${defusedCnt} / ${squads.length} đội gỡ thành công</span>
        </div>
        <div class="stage-prompt">${formatRichText(q.prompt)}</div>
      </section>

      <section class="squads-bomb-grid" style="margin-bottom:18px;">${squadCardsHtml}</section>

      ${renderAnalyticsCard(q, analytics, true, st.showExplanation)}
    `;
  }

  function renderImpostorStage(st, q, analytics) {
    const md = st.modeData || {};
    const power = md.reactorPower ?? 55;
    const delta = md.lastReactorDelta || 0;
    const remSec = app.localRemaining === null ? null : Math.ceil(app.localRemaining);
    const timerHtml = ["answering", "impostor_vote"].includes(st.phase) ? renderLiveFlipTimerHtml(remSec) : "";
    const barColor = power >= 65 ? "#059669" : power >= 35 ? "#d97706" : "#e11d48";

    const reactorBarHtml = `
      <section class="reactor-hud-card">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:10px;">
          <div style="display:flex; align-items:center; gap:9px;">
            <span class="reactor-core-ico" style="color:${barColor};">${icon("reactor", 22)}</span>
            <div>
              <div style="font-weight:800; font-size:0.98rem;">Lò Phản Ứng Toán Học: <span style="font-family:var(--font-mono); color:${barColor};">${power}%</span></div>
              <div style="font-size:0.78rem; color:var(--text-secondary);">Mục tiêu Kỹ sư: giữ năng lượng &ge; 60% hoặc tìm hết Kẻ Phá Hoại</div>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            ${st.phase === "review" && delta !== 0 ? `<span class="badge ${delta > 0 ? "badge-success" : "badge-rose"}">${delta > 0 ? `+${delta}% năng lượng` : `${delta}% năng lượng`}</span>` : ""}
            <span class="badge badge-purple">${icon("impostorVisor", 14)} Còn ${md.remainingImpostors ?? "?"} Kẻ Phá Hoại ẩn danh</span>
          </div>
        </div>
        <div class="progress-track" style="height:14px;">
          <div class="progress-fill" style="width:${power}%; background:${barColor};"></div>
        </div>
      </section>
    `;

    if (st.phase === "impostor_vote") {
      const suspects = (md.suspects || []).filter((s) => !s.ejected);
      const tallies = md.voteTallies || {};
      const skipCnt = tallies.skip || 0;
      return `
        ${reactorBarHtml}
        <section class="stage-question-card">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:10px;">
            <span class="badge badge-purple" style="font-size:0.88rem;">${icon("voteBox", 15)} HỌP KHẨN CẤP — BỎ PHIẾU TRỤC XUẤT</span>
            ${timerHtml}
          </div>
          ${(md.clues || []).length ? `
            <div class="radar-clue-box" style="margin-bottom:16px;">
              <div style="font-weight:800; color:#5b21b6; display:flex; align-items:center; gap:7px; margin-bottom:6px;">
                ${icon("radar", 18)} Dữ liệu Radar Truy Vết:
              </div>
              ${md.clues.map((c) => `<div style="font-size:0.95rem; margin-bottom:4px;">• ${escapeHtml(c)}</div>`).join("")}
            </div>
          ` : ""}
          <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:12px;">
            <div style="font-weight:700; color:var(--text-secondary);">
              Đã bỏ phiếu: <strong>${md.votesCast || 0} / ${md.eligibleVoters || 0}</strong> • Phiếu bỏ qua: <strong>${skipCnt}</strong>
            </div>
            <button class="btn btn-purple" data-act="resolve_vote">${icon("checkCircle", 17)} Công bố kết quả bỏ phiếu</button>
          </div>
          <div class="suspect-vote-grid">
            ${suspects
              .map((s) => {
                const v = tallies[s.id] || 0;
                return `
                  <div class="suspect-vote-card ${v > 0 ? "has-votes" : ""}">
                    ${avatarBadge(s.name, s.avatar, 34)}
                    <div style="min-width:0; flex:1; font-weight:700; font-size:0.9rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(s.name)}</div>
                    ${v > 0 ? `<span class="badge badge-rose" style="font-family:var(--font-mono);">${v} phiếu</span>` : ""}
                  </div>
                `;
              })
              .join("")}
          </div>
        </section>
      `;
    }

    if (st.phase === "impostor_vote_result") {
      const vr = md.lastVoteResult || {};
      let verdictHtml = "";
      if (!vr.ejectedId) {
        verdictHtml = `
          <div class="icon-emblem" style="background:var(--surface-subtle); color:var(--text-secondary); border-color:var(--border-strong);">${icon("shield", 28)}</div>
          <h2 style="margin:6px 0 6px; font-size:1.45rem;">Không ai bị trục xuất ở vòng này</h2>
          <p style="margin:0; color:var(--text-secondary);">${vr.tie ? "Số phiếu cao nhất bị hòa nhau." : "Đa số lớp đã chọn Bỏ qua phiếu."} Kẻ Phá Hoại vẫn đang ẩn mình trong lớp!</p>
        `;
      } else if (vr.wasImpostor) {
        verdictHtml = `
          <div class="icon-emblem" style="background:var(--success-soft); color:var(--success); border-color:var(--success-border);">${icon("checkCircle", 28)}</div>
          <span class="badge badge-success" style="margin-bottom:8px;">TRỤC XUẤT CHÍNH XÁC (+15% Lò phản ứng)</span>
          <h2 style="margin:4px 0 6px; font-size:1.5rem; color:var(--success);">${escapeHtml(vr.ejectedName)} ĐÚNG LÀ KẺ PHÁ HOẠI!</h2>
          <p style="margin:0; color:var(--text-secondary);">Còn lại <strong>${vr.remainingImpostors}</strong> Kẻ Phá Hoại đang ẩn danh.</p>
        `;
      } else {
        verdictHtml = `
          <div class="icon-emblem" style="background:var(--danger-soft); color:var(--danger); border-color:var(--danger-border);">${icon("sabotage", 28)}</div>
          <span class="badge badge-rose" style="margin-bottom:8px;">TRỤC XUẤT NHẦM NGƯỜI</span>
          <h2 style="margin:4px 0 6px; font-size:1.5rem; color:var(--danger);">${escapeHtml(vr.ejectedName)} là Kỹ Sư Vô Tội!</h2>
          <p style="margin:0; color:var(--text-secondary);">Còn nguyên <strong>${vr.remainingImpostors}</strong> Kẻ Phá Hoại vẫn đang trà trộn trong lớp.</p>
        `;
      }
      return `
        ${reactorBarHtml}
        <section class="analytics-card" style="text-align:center; padding:42px 24px;">
          ${verdictHtml}
        </section>
      `;
    }

    const totalSub = analytics.totalSubmitted || 0;
    const pctSub = st.playerCount > 0 ? Math.min(100, Math.round((totalSub / st.playerCount) * 100)) : 0;

    return `
      ${reactorBarHtml}
      <section class="stage-question-card">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
          <span class="badge badge-purple" style="font-size:0.86rem;">Câu ${st.questionIndex + 1} / ${st.totalQuestions} • Nhiệm vụ Sửa Lò Phản Ứng</span>
          ${timerHtml}
        </div>
        <div class="stage-prompt">${formatRichText(q.prompt)}</div>
        <div class="stage-metrics-row">
          <div style="font-weight:800; font-size:0.95rem; color:var(--primary); display:inline-flex; align-items:center; gap:6px;" id="liveSubmittedLabel">
            ${icon("users", 16)} ${totalSub} / ${st.playerCount} học sinh đã nộp (${pctSub}%)
          </div>
          <div class="progress-track"><div class="progress-fill" style="width:${pctSub}%;"></div></div>
        </div>
      </section>

      ${st.phase === "review" && (md.clues || []).length ? `
        <section class="radar-clue-box" style="margin-bottom:16px;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
            <div>
              <div style="font-weight:800; color:#5b21b6; display:flex; align-items:center; gap:7px; margin-bottom:4px;">
                ${icon("radar", 18)} Báo cáo Radar sau Câu ${st.questionIndex + 1}:
              </div>
              ${md.clues.map((c) => `<div style="font-size:0.95rem; color:var(--text);">• ${escapeHtml(c)}</div>`).join("")}
            </div>
            ${(md.remainingImpostors || 0) > 0 ? `
              <button class="btn btn-purple" data-act="start_meeting">${icon("voteBox", 17)} Mở Họp Khẩn &amp; Bỏ Phiếu</button>
            ` : ""}
          </div>
        </section>
      ` : ""}

      ${st.phase === "review" || st.settings.showLiveChart
        ? renderAnalyticsCard(q, analytics, st.revealAnswer, st.showExplanation)
        : renderHiddenLiveCard(st, totalSub)}
    `;
  }

  function renderGlassBridgeStage(st, q, analytics) {
    const remSec = app.localRemaining === null ? null : Math.ceil(app.localRemaining);
    const timerHtml = ["answering", "bridge_debate"].includes(st.phase) ? renderLiveFlipTimerHtml(remSec) : "";
    const totalSub = analytics.totalSubmitted || 0;
    const stats = analytics.optionStats || [];
    const totalSwitches = st.modeData?.totalSwitches || 0;

    const stepDots = Array.from({ length: st.totalQuestions }, (_, i) => {
      const stateCls = i < st.questionIndex ? "done" : i === st.questionIndex ? "current" : "";
      return `<span class="bridge-step-dot ${stateCls}">${i + 1}</span>`;
    }).join("");

    let phaseBanner = "";
    if (st.phase === "answering") {
      phaseBanner = `
        <div class="bridge-phase-bar is-stepping">
          <div>
            <strong>Pha 1 — Bí mật chọn tấm kính:</strong> Đã có <strong>${totalSub} / ${st.playerCount}</strong> học sinh bước lên cầu (đang ẩn vị trí để tự suy nghĩ).
          </div>
          <button class="btn btn-primary" data-act="start_debate">${icon("debate", 17)} Mở 15s Tranh Luận</button>
        </div>
      `;
    } else if (st.phase === "bridge_debate") {
      phaseBanner = `
        <div class="bridge-phase-bar is-debating">
          <div>
            <strong>Pha 2 — 15 GIÂY TRANH LUẬN &amp; ĐỔI PHE!</strong> Cả lớp đang nhìn thấy nhau trên 4 tấm kính (Đã có <strong>${totalSwitches}</strong> lượt nhảy đổi ô trực tiếp!).
          </div>
          <button class="btn btn-danger" data-act="shatter_glass">${icon("hammer", 17)} Thử độ bền kính!</button>
        </div>
      `;
    } else {
      phaseBanner = `
        <div class="bridge-phase-bar is-shattered-phase">
          <div>
            <strong>Kết quả Nhịp cầu #${st.questionIndex + 1}:</strong> Có <strong>${analytics.fullCorrectCount || 0} / ${totalSub}</strong> học sinh đứng đúng tấm kính cường lực!
          </div>
        </div>
      `;
    }

    const panelsHtml = stats
      .map((s, i) => {
        const col = OPT_COLORS[i % OPT_COLORS.length];
        const showAvatars = st.phase === "bridge_debate" || st.phase === "review";
        const isShattered = st.phase === "review" && !s.isCorrect;
        const isSafe = st.phase === "review" && s.isCorrect;
        const badges = (s.playerBadges || [])
          .slice(0, 32)
          .map((pb) => `<span class="bridge-avatar-token" title="${escapeHtml(pb.name)}">${avatarBadge(pb.name, pb.avatar, 28)}</span>`)
          .join("");
        const overflow = (s.playerBadges || []).length > 32 ? `<span class="badge badge-blue">+${s.playerBadges.length - 32}</span>` : "";

        return `
          <div class="glass-panel-tile ${isShattered ? "is-shattered" : ""} ${isSafe ? "is-tempered-safe" : ""}">
            ${isShattered ? glassCrackSvg() : ""}
            <div class="glass-panel-top">
              <span class="opt-letter-badge" style="background:${isSafe ? "#059669" : col};">${s.label}</span>
              <span class="glass-panel-count">${showAvatars ? `${s.count} HS (${s.pct}%)` : "Đang ẩn"}</span>
            </div>
            <div class="glass-panel-formula">${formatRichText(s.text)}</div>
            <div class="glass-panel-avatars">
              ${showAvatars
                ? badges + overflow || '<span style="font-size:0.8rem; color:var(--text-muted);">Không có ai đứng ở ô này</span>'
                : '<span style="font-size:0.8rem; color:var(--text-muted);">Vị trí sẽ lộ diện ở Pha Tranh Luận</span>'}
            </div>
            ${isSafe ? `<div class="glass-safe-tag">${icon("shieldCheck", 15)} KÍNH CƯỜNG LỰC AN TOÀN</div>` : ""}
            ${isShattered ? `<div class="glass-broken-tag">${icon("xCircle", 15)} KÍNH VỠ!</div>` : ""}
          </div>
        `;
      })
      .join("");

    return `
      <section class="stage-question-card">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:8px;">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span class="badge badge-teal" style="font-size:0.86rem;">${icon("glassBridge", 14)} Nhịp cầu ${st.questionIndex + 1} / ${st.totalQuestions}</span>
            <div class="bridge-steps-strip">${stepDots}</div>
          </div>
          ${timerHtml}
        </div>
        <div class="stage-prompt">${formatRichText(q.prompt)}</div>
      </section>

      ${phaseBanner}

      <section class="glass-bridge-grid" id="analyticsCardRoot">
        <div class="glass-panels-4">${panelsHtml}</div>
        ${renderInlineExplanationHtml(q, st.phase === "review" && st.showExplanation)}
      </section>
    `;
  }

  // Single "Kết thúc" button with clean checkCircle icon
  function renderHiddenLiveCard(st, totalSub) {
    return `
      <section class="analytics-card" style="text-align:center; padding:42px 24px;">
        <div class="icon-emblem">${icon("radio", 28)}</div>
        <h3 style="margin:0 0 6px; font-size:1.22rem;">Học sinh đang trả lời trên điện thoại...</h3>
        <p style="margin:0 0 22px; color:var(--text-secondary); max-width:540px; margin-inline:auto;">
          Biểu đồ sẽ tự động tổng hợp ngay khi tất cả học sinh nộp xong, hoặc khi giáo viên bấm Kết thúc.
          Đã nhận <strong>${totalSub} / ${st.playerCount}</strong> bài nộp.
        </p>
        <div>
          <button class="btn btn-primary btn-lg" data-act="lock" style="min-width:190px;">
            ${icon("checkCircle", 18)} Kết thúc
          </button>
        </div>
      </section>
    `;
  }

  function renderInlineExplanationHtml(q, isOpen) {
    return `
      <div class="inline-expl-slot ${isOpen ? "is-open" : ""}" id="inlineExplSlot">
        <div class="inline-expl-inner">
          <div class="inline-explanation-box" id="inlineExplanationBox">
            <div class="explanation-title" style="margin-bottom:8px;">
              ${icon("bulb", 19)}
              <span>Lời giải</span>
            </div>
            <div class="explanation-body">
              ${q.explanation ? formatRichText(q.explanation) : '<em style="color:var(--text-secondary);">Câu hỏi này chưa có nội dung lời giải.</em>'}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderAnalyticsCard(q, a, reveal, showExplanation) {
    let body = "";

    if (q.type === "mcq") {
      const stats = a.optionStats || [];
      body = `
        <div class="mcq-bars">
          ${stats
            .map((s, i) => {
              const col = OPT_COLORS[i % OPT_COLORS.length];
              const cls = reveal ? (s.isCorrect ? "is-correct-revealed" : "is-dimmed") : "";
              const collapsed = showExplanation && !s.isCorrect ? "is-collapsed-wrong" : "";
              return `
                <div class="mcq-bar-slot ${collapsed}" data-is-correct="${s.isCorrect ? "1" : "0"}">
                  <div class="mcq-bar-slot-inner">
                    <div class="mcq-bar-row ${cls}">
                      <div class="mcq-bar-bg" style="width:${s.pct}%; background:${reveal && s.isCorrect ? "#059669" : col};"></div>
                      <div class="mcq-bar-content">
                        <div class="mcq-bar-left">
                          <span class="opt-letter-badge" style="background:${reveal && s.isCorrect ? "#059669" : col};">${s.label}</span>
                          <div>${formatRichText(s.text)}</div>
                        </div>
                        <div class="mcq-bar-stat">
                          ${reveal && s.isCorrect ? `<span class="badge badge-success">${icon("check", 13)} ĐÁP ÁN ĐÚNG</span>` : ""}
                          <span>${s.count} HS</span>
                          <span style="color:var(--text-muted); font-size:0.95rem;">(${s.pct}%)</span>
                        </div>
                      </div>
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
          <div style="margin-bottom:14px; padding:12px 16px; border-radius:12px; background:var(--success-soft); border:1.5px solid var(--success); display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <strong style="color:var(--success); display:inline-flex; align-items:center; gap:5px;">${icon("checkCircle", 16)} Đáp án chuẩn:</strong>
            ${(a.acceptedAnswers || []).map((x) => `<span class="badge badge-success" style="font-size:0.94rem;">${escapeHtml(x)}</span>`).join("")}
          </div>
        ` : ""}
        <div class="answer-cloud">
          ${groups.length
            ? groups
                .map((g) => {
                  const cls = reveal ? (g.isCorrect ? "is-correct" : "is-wrong") : "";
                  return `<div class="cloud-chip ${cls}"><span>${escapeHtml(g.label)}</span><span class="cloud-count">${g.count} HS (${g.pct}%)</span></div>`;
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
        const pill = `<span class="badge ${reveal ? "badge-success" : "badge-amber"}" style="font-size:0.98rem; padding:4px 12px; margin:0 4px;">${display} (${b.accuracyPct}% đúng)</span>`;
        renderedTpl = renderedTpl.replace(`{{${b.index}}}`, pill);
      });
      body = `
        <div style="font-size:1.15rem; line-height:2.1; padding:16px 20px; border-radius:14px; background:var(--surface-subtle); border:1.5px solid var(--border); margin-bottom:16px;">
          ${renderedTpl}
        </div>
        <div class="form-grid-2">
          ${blanks
            .map(
              (b) => `
              <div class="tf-stat-row" style="margin:0;">
                <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                  <strong>Chỗ trống #${b.index + 1}</strong>
                  <span class="badge badge-blue">${b.accuracyPct}% đúng</span>
                </div>
                <div style="display:flex; flex-wrap:wrap; gap:6px;">
                  ${(b.topAnswers || [])
                    .map((ta) => `<span class="badge ${reveal ? (ta.isCorrect ? "badge-success" : "badge-rose") : "badge-amber"}">${escapeHtml(ta.text)} × ${ta.count}</span>`)
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
        <div style="margin-bottom:14px;">
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
                    <div>${reveal ? formatRichText(ps.correctText) : `Vị trí thứ ${ps.slot}`}</div>
                  </div>
                  <div class="mcq-bar-stat"><span>${ps.accuracyPct}% đúng vị trí</span></div>
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
              ${topSeqs.map((sq) => `<span class="badge ${reveal ? (sq.isCorrect ? "badge-success" : "badge-amber") : "badge-blue"}">${sq.labels.join(" → ")} : ${sq.count} HS (${sq.pct}%)</span>`).join("")}
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
                    <span style="color:var(--primary);">${icon("link", 16)}</span>
                    <span>${reveal ? formatRichText(ps.correctRight) : "???"}</span>
                  </div>
                  <div class="mcq-bar-stat"><span class="badge ${ps.accuracyPct >= 70 ? "badge-success" : "badge-amber"}">${ps.accuracyPct}% ghép đúng</span></div>
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
      <section class="analytics-card" id="analyticsCardRoot">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; flex-wrap:wrap; gap:8px;">
          <h3 style="margin:0; font-size:1.05rem; display:inline-flex; align-items:center; gap:8px;">${icon("barChart", 18)} Câu trả lời</h3>
        </div>
        ${body}
        ${renderInlineExplanationHtml(q, showExplanation)}
      </section>
    `;
  }

  function renderLeaderboardView(st) {
    const lb = st.leaderboard || [];
    const top3 = lb.slice(0, 3);
    const isEnd = st.phase === "finished";
    const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean);
    const rankColors = { 1: "#d97706", 2: "#64748b", 3: "#c2410c" };

    // Quizizz-style Top-3 Shuffle -> #1 Slam -> #2 & #3 Drop (clean academic theme!)
    if (isEnd) {
      const alreadyDone = app.podiumRevealedKey === `${st.code}-finished`;
      const finalSlotForRank = (rk) => (rk === 1 ? 1 : rk === 2 ? 0 : 2);
      const impWinner = st.gameMode === "math_impostor" ? st.modeData?.winner : null;
      const impNames = (st.modeData?.impostorNames || []).join(", ");
      const modeFinaleBanner = impWinner
        ? `
          <div class="card" style="margin-bottom:16px; border-width:2px; border-color:${impWinner === "crew" ? "var(--success)" : "var(--danger)"}; background:${impWinner === "crew" ? "var(--success-soft)" : "var(--danger-soft)"}; text-align:center;">
            <div style="font-weight:800; font-size:1.2rem; color:${impWinner === "crew" ? "var(--success)" : "var(--danger)"}; display:inline-flex; align-items:center; gap:8px;">
              ${icon(impWinner === "crew" ? "shieldCheck" : "impostorVisor", 22)}
              <span>${impWinner === "crew" ? "ĐỘI KỸ SƯ TOÁN HỌC CHIẾN THẮNG! ĐÃ BẢO VỆ LÒ PHẢN ỨNG!" : "KẺ PHÁ HOẠI CHIẾN THẮNG! LÒ PHẢN ỨNG ĐÃ TÊ LIỆT!"}</span>
            </div>
            ${impNames ? `<div style="margin-top:6px; font-size:0.9rem; color:var(--text-secondary);">Danh tính Kẻ Phá Hoại trong ván này: <strong>${escapeHtml(impNames)}</strong></div>` : ""}
          </div>
        `
        : "";
      return `
        ${modeFinaleBanner}
        <section class="podium-stage-card" id="quizizzPodiumStage">
          <canvas class="podium-confetti-canvas" id="podiumConfettiCanvas"></canvas>
          <div class="podium-stage-inner">
            <div class="podium-suspense-banner" id="podiumStatusBanner">
              ${icon("trophy", 15)} <span>${alreadyDone ? "Vinh danh Top 3 chung cuộc" : "Top 3 xuất sắc nhất — Ai sẽ là Quán quân?"}</span>
            </div>
            <h2 style="margin:2px 0 4px; font-size:1.52rem; font-weight:800; color:var(--text);">${escapeHtml(st.setTitle)}</h2>
            <p style="margin:0; color:var(--text-secondary); font-size:0.9rem;">${st.playerCount} học sinh tham gia • ${st.totalQuestions} câu hỏi</p>

            <div class="qp-arena" id="qpArena">
              ${top3
                .map((p, idx) => {
                  const slot = alreadyDone ? finalSlotForRank(p.rank) : idx;
                  const cardCls = alreadyDone
                    ? p.rank === 1
                      ? "is-revealed-1"
                      : ""
                    : "is-shuffling";
                  return `
                    <div class="qp-card ${cardCls}" data-qp-rank="${p.rank}" data-slot="${slot}" data-target-score="${Number(p.score || 0)}">
                      <div class="qp-player-pill">
                        <div class="qp-crown ${alreadyDone && p.rank === 1 ? "" : "hidden"}" data-qp-crown="${p.rank}">${icon("trophy", 20)}</div>
                        ${avatarBadge(p.name, p.avatar, p.rank === 1 && alreadyDone ? 48 : 42)}
                        <div class="qp-name">${escapeHtml(p.name)}</div>
                        <div class="qp-score" data-score-counter="${p.rank}">${alreadyDone ? `${fmtScore(p.score)} đ` : "???"}</div>
                      </div>
                      <div class="qp-pedestal p-${p.rank} ${alreadyDone ? "" : "is-hidden-ped"}" data-qp-ped="${p.rank}">
                        <div class="qp-rank-num">#${p.rank}</div>
                        <div class="qp-sub-acc">Đúng ${p.correctCount}/${st.totalQuestions} câu</div>
                      </div>
                    </div>
                  `;
                })
                .join("")}
            </div>

            <div style="display:flex; justify-content:center; gap:10px; margin-top:12px;">
              <button type="button" class="btn btn-outline btn-sm" id="btnReplayPodium">${icon("refresh", 14)} Phát lại vinh danh</button>
            </div>
          </div>
        </section>

        <section class="analytics-card final-table-card ${alreadyDone ? "is-revealed" : ""}" id="finalTableCard">
          <h3 style="margin:0 0 12px; font-size:1.05rem; display:inline-flex; align-items:center; gap:8px;">${icon("barChart", 18)} Bảng xếp hạng chung cuộc</h3>
          <div style="overflow-x:auto; text-align:left;">
            <table class="lb-table">
              <thead>
                <tr><th>Hạng</th><th>Học sinh</th><th>Lớp</th><th>Số câu đúng</th><th>Tổng điểm</th></tr>
              </thead>
              <tbody>
                ${lb
                  .map(
                    (p) => `
                    <tr>
                      <td style="font-family:var(--font-mono); font-weight:800;">#${p.rank}</td>
                      <td style="font-weight:700; display:flex; align-items:center; gap:9px;">${avatarBadge(p.name, p.avatar, 28)} <span>${escapeHtml(p.name)}</span></td>
                      <td>${escapeHtml(p.className || "-")}</td>
                      <td>${p.correctCount} / ${st.totalQuestions}</td>
                      <td style="font-family:var(--font-mono); font-weight:800; color:var(--primary);">${fmtScore(p.score)}</td>
                    </tr>
                  `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        </section>
      `;
    }

    // Mid-game leaderboard view with Lucian #246 Rank-Swapping Bar Race
    const topRace = lb.slice(0, 8);
    const raceH = Math.max(52, topRace.length * 46);
    return `
      <section class="analytics-card" style="text-align:center;">
        <span class="badge badge-purple" style="font-size:0.88rem;">
          ${icon("trophy", 14)} BẢNG XẾP HẠNG HIỆN TẠI
        </span>
        <h2 style="margin:10px 0 4px; font-size:1.5rem;">${escapeHtml(st.setTitle)}</h2>
        <p style="margin:0; color:var(--text-secondary);">${st.playerCount} học sinh tham gia • ${st.totalQuestions} câu hỏi</p>

        ${
          topRace.length > 0
            ? `
              <div class="u246-race-wrap" style="text-align:left;">
                <div class="u246-race-head">
                  <strong>Đua top trực tiếp (Top ${topRace.length})</strong>
                  <span class="u246-race-sub">Câu ${st.questionIndex + 1} / ${st.totalQuestions}</span>
                </div>
                <div class="u246-race-board" id="u246RaceBoard" style="height:${raceH}px;"></div>
              </div>
            `
            : ""
        }

        <div class="podium-row">
          ${podiumOrder
            .map(
              (p) => `
              <div class="podium-slot rank-${p.rank}">
                <div style="display:flex; align-items:center; justify-content:center; gap:8px; margin-bottom:6px;">
                  <span style="color:${rankColors[p.rank] || "var(--primary)"};">${icon("award", 22)}</span>
                  ${avatarBadge(p.name, p.avatar, 42)}
                </div>
                <div style="font-size:0.78rem; font-weight:800; color:${rankColors[p.rank] || "var(--text-muted)"};">HẠNG #${p.rank}</div>
                <div style="font-weight:800; font-size:1.04rem; margin-top:2px;">${escapeHtml(p.name)}</div>
                ${p.className ? `<div style="font-size:0.8rem; color:var(--text-muted);">${escapeHtml(p.className)}</div>` : ""}
                <div style="font-family:var(--font-mono); font-size:1.35rem; font-weight:800; color:var(--primary); margin-top:8px;">${fmtScore(p.score)} đ</div>
                <div style="font-size:0.8rem; color:var(--success); font-weight:700;">Đúng trọn vẹn ${p.correctCount} câu</div>
              </div>
            `
            )
            .join("")}
        </div>

        <div style="overflow-x:auto; text-align:left;">
          <table class="lb-table">
            <thead>
              <tr><th>Hạng</th><th>Học sinh</th><th>Lớp</th><th>Số câu đúng</th><th>Tổng điểm</th></tr>
            </thead>
            <tbody>
              ${lb
                .map(
                  (p) => `
                  <tr>
                    <td style="font-family:var(--font-mono); font-weight:800;">#${p.rank}</td>
                    <td style="font-weight:700; display:flex; align-items:center; gap:9px;">${avatarBadge(p.name, p.avatar, 28)} <span>${escapeHtml(p.name)}</span></td>
                    <td>${escapeHtml(p.className || "-")}</td>
                    <td>${p.correctCount} / ${st.totalQuestions}</td>
                    <td style="font-family:var(--font-mono); font-weight:800; color:var(--primary);">${fmtScore(p.score)}</td>
                  </tr>
                `
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function mountBarRaceLeaderboard(st) {
    const board = document.getElementById("u246RaceBoard");
    if (!board) return;
    const lb = (st.leaderboard || []).slice(0, 8);
    if (!lb.length) return;

    const ROW_H = 46;
    const palette = ["#2563eb", "#0d9488", "#d97706", "#7c3aed", "#e11d48", "#0284c7", "#16a34a", "#ea580c"];
    const maxScore = Math.max(10, ...lb.map((p) => Number(p.score || 0)));
    const prevMap = app.prevRaceSnapshot || new Map();

    // Build rows keyed by player id at their previous rank (or bottom) so overtaking glides visibly!
    const items = lb.map((p, newIdx) => {
      const key = p.id || p.name;
      const prev = prevMap.get(key);
      const startIdx = prev ? Math.min(lb.length - 1, prev.idx) : newIdx;
      const startPct = prev ? prev.pct : 0;
      const targetPct = Math.max(8, Math.round((Number(p.score || 0) / maxScore) * 100));
      const movedUp = prev && newIdx < prev.idx;
      const color = palette[newIdx % palette.length];
      return { p, key, newIdx, startIdx, startPct, targetPct, movedUp, color };
    });

    board.innerHTML = items
      .map(
        ({ p, key, startIdx, startPct, movedUp, color }) => `
        <div
          class="u246-row ${p.rank === 1 ? "is-first" : ""} ${movedUp ? "is-rising" : ""}"
          data-race-id="${escapeHtml(key)}"
          style="transform:translate3d(0, ${startIdx * ROW_H}px, 0);"
        >
          <span class="u246-rank">#${p.rank}</span>
          <div class="u246-who">
            ${avatarBadge(p.name, p.avatar, 26)}
            <span class="u246-name">${escapeHtml(p.name)}</span>
          </div>
          <div class="u246-track">
            <div class="u246-fill" style="width:${startPct}%; background:${color};"></div>
          </div>
          <span class="u246-score" data-target="${Number(p.score || 0)}">${fmtScore(prevMap.get(key)?.score ?? 0)} đ</span>
        </div>
      `
      )
      .join("");

    // Glide to target rank + target width + count up scores on next frame
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!board.isConnected) return;
        items.forEach(({ key, newIdx, targetPct, p }) => {
          const row = board.querySelector(`[data-race-id="${CSS.escape(key)}"]`);
          if (!row) return;
          row.style.transform = `translate3d(0, ${newIdx * ROW_H}px, 0)`;
          const fill = row.querySelector(".u246-fill");
          if (fill) fill.style.width = `${targetPct}%`;
          const scoreEl = row.querySelector(".u246-score");
          if (scoreEl) {
            const from = Number(prevMap.get(key)?.score ?? 0);
            const to = Number(p.score || 0);
            const t0 = performance.now();
            const dur = 580;
            const tick = (now) => {
              if (!scoreEl.isConnected) return;
              const k = Math.min(1, (now - t0) / dur);
              const eased = 1 - Math.pow(1 - k, 3);
              scoreEl.textContent = `${fmtScore(from + (to - from) * eased)} đ`;
              if (k < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          }
        });
      });
    });

    // Save snapshot for next question's rank swap
    const nextSnap = new Map();
    items.forEach(({ key, newIdx, targetPct, p }) => {
      nextSnap.set(key, { idx: newIdx, pct: targetPct, score: Number(p.score || 0) });
    });
    app.prevRaceSnapshot = nextSnap;
  }

  function animateScoreCounter(rank, target) {
    const el = document.querySelector(`[data-score-counter="${rank}"]`);
    if (!el) return;
    const start = performance.now();
    const dur = 750;
    const step = (now) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = `${fmtScore(target * eased)} đ`;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function firePodiumConfetti() {
    const canvas = document.getElementById("podiumConfettiCanvas");
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width || 800;
    canvas.height = rect.height || 420;
    const ctx = canvas.getContext("2d");
    const colors = ["#fbbf24", "#38bdf8", "#34d399", "#a78bfa", "#fb7185", "#ffffff"];
    const parts = Array.from({ length: 110 }, () => ({
      x: canvas.width * (0.2 + Math.random() * 0.6),
      y: canvas.height * 0.42,
      vx: (Math.random() - 0.5) * 11,
      vy: -5 - Math.random() * 9.5,
      size: 5 + Math.random() * 6,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.25,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: 1,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = 0;
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.24;
        p.vx *= 0.99;
        p.rot += p.vrot;
        if (p.y > canvas.height * 0.82) p.alpha -= 0.025;
        if (p.alpha <= 0) continue;
        alive++;
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.65);
        ctx.restore();
      }
      if (alive > 0) app.confettiRaf = requestAnimationFrame(draw);
      else app.confettiRaf = null;
    };
    if (app.confettiRaf) cancelAnimationFrame(app.confettiRaf);
    app.confettiRaf = requestAnimationFrame(draw);
  }

  function mountQuizizzFinalPodium(st, forceReplay = false) {
    const replayBtn = document.getElementById("btnReplayPodium");
    if (replayBtn) {
      replayBtn.onclick = () => {
        app.podiumRevealedKey = null;
        renderRoom();
      };
    }

    const key = `${st.code}-finished`;
    if (!forceReplay && app.podiumRevealedKey === key) return;
    app.podiumRevealedKey = key;
    clearPodiumEffects();

    const banner = document.getElementById("podiumStatusBanner");
    const c1 = document.querySelector('[data-qp-rank="1"]');
    const c2 = document.querySelector('[data-qp-rank="2"]');
    const c3 = document.querySelector('[data-qp-rank="3"]');
    const cards = [c1, c2, c3].filter(Boolean);
    const tbl = document.getElementById("finalTableCard");

    const setBanner = (txt) => {
      if (banner) banner.innerHTML = `${icon("trophy", 15)} <span>${escapeHtml(txt)}</span>`;
    };

    // Phase 1: 3 finalists weave/shuffle left-center-right so nobody knows who is #1!
    const perms = [
      [0, 1, 2],
      [2, 0, 1],
      [1, 2, 0],
      [0, 2, 1],
      [2, 1, 0],
      [1, 0, 2],
    ];
    perms.forEach((perm, step) => {
      app.podiumTimers.push(
        setTimeout(() => {
          cards.forEach((el, i) => {
            el.setAttribute("data-slot", String(perm[i] ?? i));
          });
        }, 120 + step * 330)
      );
    });

    // Phase 2: Top 1 SLAMS straight into Center (#1) first!
    app.podiumTimers.push(
      setTimeout(() => {
        if (c2) {
          c2.classList.remove("is-shuffling");
          c2.setAttribute("data-slot", "0");
          c2.classList.add("is-waiting-drop");
        }
        if (c3) {
          c3.classList.remove("is-shuffling");
          c3.setAttribute("data-slot", "2");
          c3.classList.add("is-waiting-drop");
        }
        if (c1) {
          c1.classList.remove("is-shuffling");
          c1.setAttribute("data-slot", "1");
          c1.classList.add("is-slam-1", "is-revealed-1");
          const ped1 = document.querySelector('[data-qp-ped="1"]');
          const cr1 = document.querySelector('[data-qp-crown="1"]');
          if (ped1) ped1.classList.remove("is-hidden-ped");
          if (cr1) cr1.classList.remove("hidden");
          const topName = st.leaderboard && st.leaderboard[0] ? st.leaderboard[0].name : "";
          setBanner(topName ? `Quán quân: ${topName}!` : "Chúc mừng Quán quân!");
          animateScoreCounter(1, Number(c1.dataset.targetScore || 0));
          firePodiumConfetti();
        }
      }, 2250)
    );

    // Phase 3: Then #2 and #3 drop cleanly into Left & Right pedestals!
    app.podiumTimers.push(
      setTimeout(() => {
        if (c2) {
          c2.classList.remove("is-waiting-drop");
          c2.classList.add("is-slam-side");
          const ped2 = document.querySelector('[data-qp-ped="2"]');
          if (ped2) ped2.classList.remove("is-hidden-ped");
          animateScoreCounter(2, Number(c2.dataset.targetScore || 0));
        }
      }, 3050)
    );

    app.podiumTimers.push(
      setTimeout(() => {
        if (c3) {
          c3.classList.remove("is-waiting-drop");
          c3.classList.add("is-slam-side");
          const ped3 = document.querySelector('[data-qp-ped="3"]');
          if (ped3) ped3.classList.remove("is-hidden-ped");
          animateScoreCounter(3, Number(c3.dataset.targetScore || 0));
        }
      }, 3400)
    );

    // Phase 4: Reveal full leaderboard table underneath
    app.podiumTimers.push(
      setTimeout(() => {
        if (tbl) tbl.classList.add("is-revealed");
      }, 3950)
    );
  }

  // Fixed icon dock order: Slot 1 = Lời giải, Slot 2 = BXH, | Slot 3 = Next (NEVER swaps!)
  function renderIconDock(st) {
    const isLast = st.questionIndex >= st.totalQuestions - 1;
    let buttons = "";

    if (st.phase === "answering") {
      const lockTip = st.gameMode === "glass_bridge" ? "Mở 15s Tranh luận & Đổi phe" : "Kết thúc câu & Tổng hợp (L)";
      const lockIco = st.gameMode === "glass_bridge" ? "debate" : "checkCircle";
      buttons = `
        <button class="dock-icon-btn" id="btnExtend15" data-tip="Thêm 15 giây">${icon("clock", 20)}</button>
        ${st.gameMode === "classic" ? `<button class="dock-icon-btn ${st.settings.showLiveChart ? "is-active" : ""}" id="btnToggleLiveChart" data-tip="${st.settings.showLiveChart ? "Ẩn biểu đồ trực tiếp" : "Hiện biểu đồ trực tiếp"}">${icon(st.settings.showLiveChart ? "eyeOff" : "eye", 20)}</button>` : ""}
        <span class="dock-sep"></span>
        <button class="dock-icon-btn is-primary" data-act="lock" data-tip="${lockTip}">${icon(lockIco, 21)}</button>
      `;
    } else if (st.phase === "bridge_debate") {
      buttons = `
        <button class="dock-icon-btn" id="btnExtend15" data-tip="Thêm 15 giây tranh luận">${icon("clock", 20)}</button>
        <span class="dock-sep"></span>
        <button class="dock-icon-btn is-primary" style="background:var(--danger); border-color:var(--danger);" data-act="shatter_glass" data-tip="Thử độ bền kính!">${icon("hammer", 20)}</button>
      `;
    } else if (st.phase === "impostor_vote") {
      buttons = `
        <button class="dock-icon-btn" id="btnExtend15" data-tip="Thêm 15 giây bỏ phiếu">${icon("clock", 20)}</button>
        <span class="dock-sep"></span>
        <button class="dock-icon-btn is-primary" data-act="resolve_vote" data-tip="Công bố kết quả bỏ phiếu">${icon("checkCircle", 21)}</button>
      `;
    } else if (st.phase === "impostor_vote_result") {
      buttons = `
        <button class="dock-icon-btn" data-act="toggle_explanation" data-tip="Xem lại lời giải">${icon("bulb", 20)}</button>
        <button class="dock-icon-btn" data-act="show_leaderboard" data-tip="Bảng xếp hạng">${icon("trophy", 20)}</button>
        <span class="dock-sep"></span>
        <button class="dock-icon-btn is-success" data-act="next" data-tip="${isLast ? "Kết thúc buổi chơi" : "Câu tiếp theo (→)"}">${icon(isLast ? "flag" : "next", 21)}</button>
      `;
    } else if (st.phase === "review" || st.phase === "leaderboard") {
      const isLb = st.phase === "leaderboard";
      const explActive = st.phase === "review" && st.showExplanation;
      const canVote = st.gameMode === "math_impostor" && (st.modeData?.remainingImpostors || 0) > 0;
      buttons = `
        <button class="dock-icon-btn ${explActive ? "is-active" : ""}" data-act="toggle_explanation" data-tip="${explActive ? "Ẩn lời giải (E)" : "Lời giải (E)"}">${icon("bulb", 20)}</button>
        <button class="dock-icon-btn ${isLb ? "is-active" : ""}" data-act="show_leaderboard" data-tip="${isLb ? "Quay lại câu trả lời" : "Bảng xếp hạng"}">${icon("trophy", 20)}</button>
        ${canVote ? `<button class="dock-icon-btn" data-act="start_meeting" data-tip="Họp khẩn & Bỏ phiếu trục xuất" style="color:var(--purple); border-color:var(--purple-border);">${icon("voteBox", 20)}</button>` : ""}
        <span class="dock-sep"></span>
        <button class="dock-icon-btn is-success" data-act="next" data-tip="${isLast ? "Kết thúc buổi chơi" : "Câu tiếp theo (→)"}">${icon(isLast ? "flag" : "next", 21)}</button>
      `;
    } else if (st.phase === "finished") {
      buttons = `
        <button class="dock-icon-btn is-primary" data-act="start" data-tip="Chơi lại từ Câu 1">${icon("refresh", 20)}</button>
      `;
    }

    return `
      <div class="icon-dock-wrap">
        <nav class="icon-dock" aria-label="Điều khiển trình chiếu">
          ${buttons}
        </nav>
      </div>
    `;
  }

  function openPlayersModal(st) {
    const rows = (st.players || [])
      .map(
        (p) => `
        <tr>
          <td style="font-weight:700; display:flex; align-items:center; gap:8px;">${avatarBadge(p.name, p.avatar, 26)} <span>${escapeHtml(p.name)}</span></td>
          <td>${escapeHtml(p.className || "-")}</td>
          <td>${p.submitted ? '<span class="badge badge-success">Đã nộp</span>' : '<span class="badge badge-amber">Chưa nộp</span>'}</td>
          <td style="font-family:var(--font-mono); font-weight:700; color:var(--success);">${p.pointsEarned ? `+${fmtScore(p.pointsEarned)}` : "0.0"}</td>
          <td style="font-family:var(--font-mono); font-weight:800; color:var(--primary);">${fmtScore(p.score)}</td>
        </tr>
      `
      )
      .join("");

    const leftList = st.leftPlayers || [];
    const leftHtml = leftList.length
      ? `
        <div style="margin-top:16px; padding-top:14px; border-top:1px solid var(--border);">
          <div style="font-size:0.84rem; font-weight:800; color:var(--danger); margin-bottom:8px;">
            Học sinh đã rời khỏi phòng / thoát màn hình (${leftList.length}):
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:6px;">
            ${leftList
              .map(
                (lp) => `<span class="badge badge-rose">${escapeHtml(lp.name)}${lp.reason === "left_screen" ? " (thoát màn hình)" : " (tự thoát)"}</span>`
              )
              .join("")}
          </div>
        </div>
      `
      : "";

    openModal({
      title: `Chi tiết học sinh (${st.playerCount})`,
      iconName: "users",
      wide: true,
      bodyHtml: `
        <div style="overflow-x:auto;">
          <table class="lb-table">
            <thead><tr><th>Họ tên</th><th>Lớp</th><th>Câu hiện tại</th><th>Điểm câu này</th><th>Tổng điểm</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="5" style="text-align:center;">Chưa có học sinh nào.</td></tr>'}</tbody>
          </table>
        </div>
        ${leftHtml}
      `,
      footerHtml: `<button type="button" class="btn btn-outline" id="btnClosePlayersOk">Đóng</button>`,
      onMount: () => { document.getElementById("btnClosePlayersOk").onclick = closeModal; },
    });
  }

  init();
})();
