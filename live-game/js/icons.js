/**
 * Custom-drawn geometric monoline SVG icons & vector illustrations
 * matching "Lớp toán thầy Hoàng" (edu-exam-2025).
 * STRICT ZERO-EMOJI POLICY: Every icon and game illustration is pure custom SVG.
 */
window.LiveIcons = (function () {
  const PATHS = {
    play: '<polygon points="6 4 20 12 6 20 6 4"/>',
    stop: '<rect x="5" y="5" width="14" height="14" rx="2.5"/>',
    next: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
    back: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
    close: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    checkCircle: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    xCircle: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
    bulb: '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.74V16a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-1.26A7 7 0 0 0 12 2z"/>',
    trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/>',
    barChart: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3z"/><path d="M20 14v3h-3"/><path d="M14 20h7"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    fullscreen: '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>',
    radio: '<circle cx="12" cy="12" r="2.2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49"/><path d="M7.76 16.24a6 6 0 0 1 0-8.49"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 19.07a10 10 0 0 1 0-14.14"/>',
    fileText: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
    refresh: '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
    externalLink: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
    arrowUp: '<polyline points="18 15 12 9 6 15"/>',
    arrowDown: '<polyline points="6 9 12 15 18 9"/>',
    trendUp: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
    trendDown: '<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
    note: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
    award: '<circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    moveVertical: '<polyline points="8 18 12 22 16 18"/><polyline points="8 6 12 2 16 6"/><line x1="12" y1="2" x2="12" y2="22"/>',
    handClick: '<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v6"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
    alertCircle: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    graduation: '<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',

    // --- Custom Vector Icons for the 4 Game Modes (hand-crafted 24x24 paths) ---
    classicBolt: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    // Bomb Defusal: Electronic timer module with 3 top terminals & digital screen
    bombModule: '<rect x="3" y="6" width="18" height="15" rx="3"/><line x1="7" y1="3" x2="7" y2="6"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="17" y1="3" x2="17" y2="6"/><rect x="7" y="10" width="10" height="5" rx="1"/><line x1="7" y1="18" x2="11" y2="18"/><circle cx="16.5" cy="18" r="1"/>',
    // Wire Cutter Pliers
    wireCutter: '<circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/><line x1="8.1" y1="15.9" x2="19" y2="5"/><line x1="15.9" y1="15.9" x2="5" y2="5"/>',
    // Shield / Squad Armor
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    shieldCheck: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>',
    // Math Impostor: Geometric incognito visor & radar hood
    impostorVisor: '<path d="M4 19v-2a8 8 0 0 1 16 0v2"/><rect x="6" y="10" width="12" height="4.5" rx="2.2"/><line x1="12" y1="3" x2="12" y2="5"/><circle cx="12" cy="2.5" r="1"/>',
    // Reactor Core
    reactor: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="9" stroke-dasharray="4 3"/><line x1="12" y1="3" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="21"/><line x1="3" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="21" y2="12"/>',
    // Radar Clue Sweep
    radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><line x1="12" y1="12" x2="18.3" y2="5.7"/><circle cx="15" cy="9" r="1"/>',
    // Vote Ballot
    voteBox: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    // Sabotage Warning Triangle
    sabotage: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    // Glass Bridge: Perspective 2-track glass tiles
    glassBridge: '<polygon points="6 3 18 3 21 21 3 21"/><line x1="12" y1="3" x2="12" y2="21"/><line x1="5" y1="9" x2="19" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/>',
    // Debate / Megaphone / Discussion waves
    debate: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="13" y2="13"/>',
    // Hammer / Tempered glass test
    hammer: '<path d="M15 12l-8.5 8.5c-.83.83-2.17.83-3 0 0 0 0 0 0 0a2.12 2.12 0 0 1 0-3L12 9"/><path d="M17.64 15L22 10.64"/><path d="M20.91 11.7l-1.25-1.25c-.6-.6-.93-1.4-.93-2.25v-.86L16.01 4.6a5.56 5.56 0 0 0-3.94-1.64H9l.92.82A6.18 6.18 0 0 1 12 8.4v1.56l2 2h2.47l2.26 1.91"/>',
  };

  function icon(name, size = 18, cls = "") {
    const p = PATHS[name] || PATHS.check;
    return `<svg class="lg-ico ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  }

  // Custom vector crack overlay for shattered Glass Bridge tiles
  function glassCrackSvg() {
    return `
      <svg class="glass-crack-svg" viewBox="0 0 200 140" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="96,68 42,18 14,26"/>
        <polyline points="96,68 154,16 186,32"/>
        <polyline points="96,68 168,94 192,122"/>
        <polyline points="96,68 58,118 22,130"/>
        <polyline points="96,68 108,128"/>
        <polyline points="68,42 88,24"/>
        <polyline points="128,42 146,56"/>
        <polygon points="88,60 108,58 104,78 84,74" fill="currentColor" fill-opacity="0.16"/>
      </svg>
    `;
  }

  // Custom vector bomb wire graphic (intact or severed with spark gap)
  function wireSvg(hexColor, isCut = false) {
    if (!isCut) {
      return `
        <svg class="bomb-wire-svg" viewBox="0 0 260 36" fill="none" aria-hidden="true">
          <rect x="2" y="9" width="14" height="18" rx="3" fill="#334155"/>
          <rect x="244" y="9" width="14" height="18" rx="3" fill="#334155"/>
          <path d="M16 18 C 78 6, 182 30, 244 18" stroke="${hexColor}" stroke-width="8" stroke-linecap="round"/>
          <path d="M16 16 C 78 4, 182 28, 244 16" stroke="#ffffff" stroke-opacity="0.35" stroke-width="2" stroke-linecap="round"/>
        </svg>
      `;
    }
    return `
      <svg class="bomb-wire-svg is-cut" viewBox="0 0 260 36" fill="none" aria-hidden="true">
        <rect x="2" y="9" width="14" height="18" rx="3" fill="#334155"/>
        <rect x="244" y="9" width="14" height="18" rx="3" fill="#334155"/>
        <path d="M16 18 C 52 10, 84 12, 108 25" stroke="${hexColor}" stroke-width="8" stroke-linecap="round"/>
        <path d="M152 11 C 180 24, 212 24, 244 18" stroke="${hexColor}" stroke-width="8" stroke-linecap="round"/>
        <line x1="124" y1="8" x2="136" y2="28" stroke="#f59e0b" stroke-width="2.4" stroke-linecap="round"/>
        <line x1="136" y1="8" x2="124" y2="28" stroke="#ef4444" stroke-width="2.4" stroke-linecap="round"/>
      </svg>
    `;
  }

  // Color-coded initials avatar badge matching edu-exam-2025 (.u408-av style)
  const AVATAR_PALETTES = [
    { id: "blue", bg: "#dbeafe", fg: "#1d4ed8", border: "#93c5fd" },
    { id: "indigo", bg: "#e0e7ff", fg: "#4338ca", border: "#a5b4fc" },
    { id: "purple", bg: "#ede9fe", fg: "#6d28d9", border: "#c4b5fd" },
    { id: "teal", bg: "#ccfbf1", fg: "#0f766e", border: "#5eead4" },
    { id: "emerald", bg: "#d1fae5", fg: "#047857", border: "#6ee7b7" },
    { id: "amber", bg: "#fef3c7", fg: "#b45309", border: "#fcd34d" },
    { id: "rose", bg: "#ffe4e6", fg: "#be123c", border: "#fda4af" },
    { id: "sky", bg: "#e0f2fe", fg: "#0369a1", border: "#7dd3fc" },
  ];

  function initialsFromName(name) {
    const parts = String(name || "HS").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "HS";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function paletteFor(keyOrName) {
    const byId = AVATAR_PALETTES.find((p) => p.id === keyOrName);
    if (byId) return byId;
    let hash = 0;
    const s = String(keyOrName || "");
    for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
    return AVATAR_PALETTES[hash % AVATAR_PALETTES.length];
  }

  function avatarBadge(name, avatarId, size = 28) {
    const pal = paletteFor(avatarId || name);
    const txt = initialsFromName(name);
    const fs = Math.max(10, Math.round(size * 0.4));
    return `<span class="lg-avatar" style="width:${size}px;height:${size}px;font-size:${fs}px;background:${pal.bg};color:${pal.fg};border-color:${pal.border};">${txt}</span>`;
  }

  const GAME_MODES = {
    classic: {
      id: "classic",
      title: "Đấu Trường Tốc Độ",
      badge: "Cổ điển 10–20đ",
      icon: "classicBolt",
      accent: "blue",
      desc: "Mỗi học sinh tự giải trên điện thoại, tính điểm tốc độ 10.0–20.0 và bục vinh danh Top 3.",
    },
    bomb_defusal: {
      id: "bomb_defusal",
      title: "Gỡ Bom Mảnh Ghép",
      badge: "Phối hợp nhóm 4",
      icon: "bombModule",
      accent: "amber",
      desc: "Chia đội 4 người: mỗi máy chỉ giữ Đề bài, Mã dây màu hoặc Kìm cắt dây — buộc cả nhóm chụm đầu giải mã!",
    },
    math_impostor: {
      id: "math_impostor",
      title: "Ma Sói Toán Học",
      badge: "Suy luận & Phá hoại",
      icon: "impostorVisor",
      accent: "purple",
      desc: "Mật vụ bí mật trà trộn phá lò phản ứng Toán học. Cả lớp vừa giải đề vừa soi manh mối để bỏ phiếu trục xuất!",
    },
    glass_bridge: {
      id: "glass_bridge",
      title: "Cầu Kính Sinh Tử",
      badge: "Tranh luận & Đổi phe",
      icon: "glassBridge",
      accent: "teal",
      desc: "Bước lên 4 tấm kính A/B/C/D → 15 giây nhìn đội hình cả lớp để tranh luận nhảy sang ô khác → Thử độ bền kính!",
    },
  };

  return {
    icon,
    glassCrackSvg,
    wireSvg,
    avatarBadge,
    AVATAR_PALETTES,
    initialsFromName,
    GAME_MODES,
  };
})();
