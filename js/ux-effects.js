/**
 * Lucian UX/UI Micro-Interactions Module for Lớp toán thầy Hoàng
 * Includes:
 *  - #416 Jelly Sliding Pill Tabs (attachJellyTabs)
 *  - #435 Stacking Toasts with Timer Bar & Hover Fan-Out (createStackingToaster)
 *  - #100 3D Folding Flip Timer (renderFlipClockHtml, updateFlipClock)
 *  - #095 Morphing Grade Bar Chart (renderMorphBarChartHtml, bindMorphBarChart)
 *  - #472 Segmented Storage Meter (renderSegmentedStorageMeterHtml, bindSegmentedStorageMeter)
 */

const REDUCED_MOTION = () =>
  Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

function escHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// =========================================================================
// #416 — JELLY SLIDING PILL TABS (WAAPI squash-and-stretch glide)
// =========================================================================
const jellyPrevRects = new Map();

export function attachJellyTabs(
  barEl,
  { key = '', itemSelector = '.main-tab, .subtab-btn, .an-seg-btn', activeClass = 'active' } = {}
) {
  if (!barEl) return null;
  const cacheKey = key || barEl.id || barEl.className;
  barEl.classList.add('u416-bar');

  let thumb = barEl.querySelector(':scope > .u416-thumb');
  if (!thumb) {
    thumb = document.createElement('span');
    thumb.className = 'u416-thumb';
    thumb.setAttribute('aria-hidden', 'true');
    barEl.insertBefore(thumb, barEl.firstChild);
  }

  function measureActive() {
    const activeEl = Array.from(barEl.querySelectorAll(itemSelector)).find(
      (el) => el.classList.contains(activeClass) && !el.classList.contains('hidden') && el.getBoundingClientRect().width > 0
    );
    if (!activeEl) return null;
    const barRect = barEl.getBoundingClientRect();
    const elRect = activeEl.getBoundingClientRect();
    return {
      left: Math.round(elRect.left - barRect.left + barEl.scrollLeft - barEl.clientLeft),
      top: Math.round(elRect.top - barRect.top + barEl.scrollTop - barEl.clientTop),
      width: Math.round(elRect.width),
      height: Math.round(elRect.height),
    };
  }

  function placeThumb(r) {
    if (!r || r.width <= 0 || r.height <= 0) {
      thumb.style.opacity = '0';
      return;
    }
    thumb.style.width = `${r.width}px`;
    thumb.style.height = `${r.height}px`;
    thumb.style.transform = `translate3d(${r.left}px, ${r.top}px, 0)`;
    thumb.style.opacity = '1';
  }

  function sync(instant = false) {
    const next = measureActive();
    if (!next) {
      thumb.style.opacity = '0';
      return;
    }
    const prev = jellyPrevRects.get(cacheKey);
    const moved = Boolean(
      prev && (prev.left !== next.left || prev.width !== next.width || prev.top !== next.top)
    );

    if (thumb._u416Anim) {
      try {
        thumb._u416Anim.cancel();
      } catch {}
      thumb._u416Anim = null;
    }

    placeThumb(next);

    if (!instant && moved && !REDUCED_MOTION() && typeof thumb.animate === 'function') {
      const dx = next.left - prev.left;
      const dy = next.top - prev.top;
      const horizontal = Math.abs(dx) >= Math.abs(dy);
      const midLeft = Math.round(prev.left + dx * 0.56);
      const midTop = Math.round(prev.top + dy * 0.52);
      const midW = Math.round((prev.width + next.width) * 0.5 + (horizontal ? Math.min(22, Math.abs(dx) * 0.14) : 0));
      const overLeft = Math.round(next.left + Math.sign(dx) * Math.min(4, Math.abs(dx) * 0.03));

      const stretchMid = horizontal ? 'scaleX(1.12) scaleY(0.89)' : 'scaleX(0.94) scaleY(1.08)';
      const settleBounce = horizontal ? 'scaleX(0.96) scaleY(1.04)' : 'scaleX(1.03) scaleY(0.97)';

      thumb.classList.add('is-gliding');
      const anim = thumb.animate(
        [
          {
            transform: `translate3d(${prev.left}px, ${prev.top}px, 0) scaleX(1) scaleY(1)`,
            width: `${prev.width}px`,
            height: `${prev.height}px`,
            offset: 0,
          },
          {
            transform: `translate3d(${midLeft}px, ${midTop}px, 0) ${stretchMid}`,
            width: `${midW}px`,
            height: `${next.height}px`,
            offset: 0.44,
          },
          {
            transform: `translate3d(${overLeft}px, ${next.top}px, 0) ${settleBounce}`,
            width: `${next.width}px`,
            height: `${next.height}px`,
            offset: 0.78,
          },
          {
            transform: `translate3d(${next.left}px, ${next.top}px, 0) scaleX(1) scaleY(1)`,
            width: `${next.width}px`,
            height: `${next.height}px`,
            offset: 1,
          },
        ],
        {
          duration: 620,
          easing: 'cubic-bezier(0.25, 1, 0.4, 1)',
        }
      );
      thumb._u416Anim = anim;
      anim.onfinish = anim.oncancel = () => {
        if (thumb._u416Anim === anim) thumb._u416Anim = null;
        thumb.classList.remove('is-gliding');
      };
    }

    jellyPrevRects.set(cacheKey, next);
  }

  sync(false);

  // Only re-measure once fonts finish loading if they weren't already loaded (never cancel an active glide!)
  if (document.fonts && document.fonts.status !== 'loaded' && !barEl._u416FontsBound) {
    barEl._u416FontsBound = true;
    document.fonts.ready.then(() => {
      if (barEl.isConnected && !thumb._u416Anim) sync(true);
    });
  }

  // Only re-snap on genuine container width changes (ignore initial observe callback & active glides!)
  if (typeof ResizeObserver === 'function' && !barEl._u416Ro) {
    let lastBarW = Math.round(barEl.getBoundingClientRect().width);
    const ro = new ResizeObserver(() => {
      if (!barEl.isConnected) return;
      const curW = Math.round(barEl.getBoundingClientRect().width);
      if (curW === lastBarW) return;
      lastBarW = curW;
      if (!thumb._u416Anim) sync(true);
    });
    ro.observe(barEl);
    barEl._u416Ro = ro;
  }

  return { sync };
}

// =========================================================================
// #435 — STACKING TOASTS WITH TIMER BAR & HOVER FAN-OUT
// =========================================================================
export function createStackingToaster(containerEl) {
  if (!containerEl) return () => {};
  containerEl.classList.add('u435-stack');

  const MAX_TOASTS = 3;
  const DEFAULT_MS = 3600;
  let items = [];
  let hovered = false;

  function iconSvg(type) {
    if (type === 'success') {
      return `<svg class="u435-ic" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.5" class="u435-ring"/><path class="u435-chk" d="M6.2 10.3 L8.9 13 L14 7.6"/></svg>`;
    }
    if (type === 'error') {
      return `<svg class="u435-ic" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.5" class="u435-ring"/><path class="u435-chk" d="M7.2 7.2 L12.8 12.8 M12.8 7.2 L7.2 12.8"/></svg>`;
    }
    return `<svg class="u435-ic" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.5" class="u435-ring"/><path class="u435-chk" d="M10 9.2 V13.6 M10 6.5 V6.7"/></svg>`;
  }

  function layout() {
    const n = items.length;
    let expandedOffset = 0;
    for (let i = n - 1; i >= 0; i--) {
      const it = items[i];
      const depth = n - 1 - i; // 0 = newest (front)
      it.el.style.zIndex = String(20 + i);
      if (hovered) {
        const h = it.el.offsetHeight || 48;
        it.el.style.transform = `translate3d(0, ${-expandedOffset}px, 0) scale(1)`;
        it.el.style.opacity = '1';
        expandedOffset += h + 8;
      } else {
        const y = -depth * 10;
        const sc = 1 - depth * 0.055;
        const op = depth === 0 ? 1 : depth === 1 ? 0.86 : 0.68;
        it.el.style.transform = `translate3d(0, ${y}px, 0) scale(${sc})`;
        it.el.style.opacity = String(op);
      }
    }
  }

  function pauseAll() {
    const now = performance.now();
    items.forEach((it) => {
      if (it.timerId) {
        clearTimeout(it.timerId);
        it.timerId = null;
        it.remaining = Math.max(250, it.remaining - (now - it.startedAt));
      }
      if (it.barEl) {
        const frac = Math.max(0, Math.min(1, it.remaining / it.duration));
        it.barEl.style.transition = 'none';
        it.barEl.style.transform = `scaleX(${frac.toFixed(4)})`;
      }
    });
  }

  function resumeAll() {
    items.forEach((it) => startTimer(it));
  }

  function startTimer(it) {
    if (it.dismissed || hovered) return;
    if (it.timerId) clearTimeout(it.timerId);
    it.startedAt = performance.now();
    if (it.barEl) {
      const frac = Math.max(0, Math.min(1, it.remaining / it.duration));
      it.barEl.style.transition = 'none';
      it.barEl.style.transform = `scaleX(${frac.toFixed(4)})`;
      void it.barEl.offsetWidth;
      it.barEl.style.transition = `transform ${Math.round(it.remaining)}ms linear`;
      it.barEl.style.transform = 'scaleX(0)';
    }
    it.timerId = setTimeout(() => dismiss(it, false), it.remaining);
  }

  function dismiss(it, swiped = false) {
    if (it.dismissed) return;
    it.dismissed = true;
    if (it.timerId) {
      clearTimeout(it.timerId);
      it.timerId = null;
    }
    it.el.classList.add('is-leaving');
    it.el.style.opacity = '0';
    it.el.style.transform = swiped ? 'translate3d(110%, 0, 0) scale(.96)' : 'translate3d(0, 18px, 0) scale(.92)';
    items = items.filter((x) => x !== it);
    layout();
    setTimeout(() => it.el.remove(), 260);
  }

  containerEl.addEventListener('mouseenter', () => {
    hovered = true;
    pauseAll();
    layout();
  });
  containerEl.addEventListener('mouseleave', () => {
    hovered = false;
    layout();
    resumeAll();
  });

  return function showToast(message, type = 'info', duration = DEFAULT_MS) {
    const cleanType = ['success', 'error', 'warning', 'info'].includes(type) ? type : 'info';
    const el = document.createElement('div');
    el.className = `toast u435-toast ${cleanType}`;
    el.setAttribute('role', cleanType === 'error' ? 'alert' : 'status');
    el.innerHTML = `
      <span class="u435-ic-wrap">${iconSvg(cleanType)}</span>
      <span class="u435-msg">${escHtml(message)}</span>
      <button type="button" class="u435-close" aria-label="Đóng thông báo">✕</button>
      <span class="u435-bar" aria-hidden="true"></span>
    `;

    const barEl = el.querySelector('.u435-bar');
    const item = {
      el,
      barEl,
      duration,
      remaining: duration,
      startedAt: performance.now(),
      timerId: null,
      dismissed: false,
    };

    el.querySelector('.u435-close')?.addEventListener('click', () => dismiss(item, true));

    // Swipe right to dismiss
    let sx = 0;
    let dragging = false;
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.u435-close')) return;
      dragging = true;
      sx = e.clientX;
      el.setPointerCapture?.(e.pointerId);
      el.style.transition = 'none';
    });
    el.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = Math.max(0, e.clientX - sx);
      el.style.transform = `translate3d(${dx}px, 0, 0)`;
      el.style.opacity = String(Math.max(0.25, 1 - dx / 180));
    });
    const endSwipe = (e) => {
      if (!dragging) return;
      dragging = false;
      el.style.transition = '';
      const dx = e.clientX - sx;
      if (dx > 64) dismiss(item, true);
      else layout();
    };
    el.addEventListener('pointerup', endSwipe);
    el.addEventListener('pointercancel', endSwipe);

    containerEl.appendChild(el);
    items.push(item);

    while (items.length > MAX_TOASTS) {
      dismiss(items[0], false);
    }

    el.style.transform = 'translate3d(0, 26px, 0) scale(.9)';
    el.style.opacity = '0';
    requestAnimationFrame(() => {
      layout();
      startTimer(item);
    });
  };
}

// =========================================================================
// #100 — FOLDING 3D FLIP TIMER
// =========================================================================
function splitTimeParts(totalSeconds, { secondsOnly = false } = {}) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  if (secondsOnly) {
    const str = String(s).padStart(2, '0');
    return { chars: str.split(''), showSep: false };
  }
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    const hStr = String(hrs).padStart(2, '0');
    const mStr = String(mins).padStart(2, '0');
    const sStr = String(secs).padStart(2, '0');
    return { chars: [...hStr, ':', ...mStr, ':', ...sStr], showSep: true };
  }
  const mStr = String(mins).padStart(2, '0');
  const sStr = String(secs).padStart(2, '0');
  return { chars: [...mStr, ':', ...sStr], showSep: true };
}

export function renderFlipClockHtml(
  seconds,
  { id = 'examClock', warnUnder = 300, compact = false, secondsOnly = false } = {}
) {
  const sec = Math.max(0, Math.floor(Number(seconds) || 0));
  const { chars } = splitTimeParts(sec, { secondsOnly });
  const isWarn = warnUnder > 0 && sec <= warnUnder;
  let dIdx = 0;

  return `
    <div
      class="u100-clock ${compact ? 'is-compact' : ''} ${isWarn ? 'is-warn warning' : ''}"
      id="${escHtml(id)}"
      data-u100-seconly="${secondsOnly ? '1' : '0'}"
      aria-label="${escHtml(chars.join(''))}"
    >
      ${chars
        .map((ch) => {
          if (ch === ':') return `<span class="u100-sep" aria-hidden="true">:</span>`;
          const idx = dIdx++;
          return `
            <span class="u100-tile" data-u100-idx="${idx}" data-val="${escHtml(ch)}">
              <span class="u100-half u100-top"><span>${escHtml(ch)}</span></span>
              <span class="u100-half u100-bot"><span>${escHtml(ch)}</span></span>
            </span>
          `;
        })
        .join('')}
    </div>
  `;
}

export function updateFlipClock(clockEl, seconds, { warnUnder = 300 } = {}) {
  if (!clockEl) return;
  const sec = Math.max(0, Math.floor(Number(seconds) || 0));
  const secondsOnly = clockEl.dataset.u100Seconly === '1';
  const { chars } = splitTimeParts(sec, { secondsOnly });
  const digits = chars.filter((c) => c !== ':');
  const existingTiles = clockEl.querySelectorAll('.u100-tile');

  clockEl.classList.toggle('is-warn', warnUnder > 0 && sec <= warnUnder);
  clockEl.classList.toggle('warning', warnUnder > 0 && sec <= warnUnder);
  clockEl.setAttribute('aria-label', chars.join(''));

  // Rebuild if digit count changed (e.g., 1:00:00 -> 59:59 or 100s -> 99s)
  if (existingTiles.length !== digits.length) {
    const tmp = document.createElement('div');
    tmp.innerHTML = renderFlipClockHtml(sec, {
      id: clockEl.id,
      warnUnder,
      compact: clockEl.classList.contains('is-compact'),
      secondsOnly,
    });
    const fresh = tmp.firstElementChild;
    clockEl.innerHTML = fresh.innerHTML;
    return;
  }

  existingTiles.forEach((tile, i) => {
    const prev = tile.dataset.val;
    const next = digits[i];
    if (prev === next) return;
    tile.dataset.val = next;
    const topSpan = tile.querySelector('.u100-top span');
    const botSpan = tile.querySelector('.u100-bot span');

    if (REDUCED_MOTION()) {
      if (topSpan) topSpan.textContent = next;
      if (botSpan) botSpan.textContent = next;
      return;
    }

    // Remove any in-flight flaps
    tile.querySelectorAll('.u100-flap').forEach((f) => f.remove());

    // Lucian #100 two-half hinge fold: top flap folds down showing prev, bottom flap unfolds showing next
    const flapTop = document.createElement('span');
    flapTop.className = 'u100-flap u100-flap-top';
    flapTop.innerHTML = `<span>${escHtml(prev)}</span>`;

    const flapBot = document.createElement('span');
    flapBot.className = 'u100-flap u100-flap-bot';
    flapBot.innerHTML = `<span>${escHtml(next)}</span>`;

    if (topSpan) topSpan.textContent = next;
    tile.appendChild(flapTop);
    tile.appendChild(flapBot);

    clearTimeout(tile._ft);
    tile._ft = setTimeout(() => {
      if (botSpan) botSpan.textContent = next;
      flapTop.remove();
      flapBot.remove();
    }, 360);
  });

  if (sec === 0 && !clockEl.dataset.shaken) {
    clockEl.dataset.shaken = '1';
    clockEl.classList.add('is-zero');
    setTimeout(() => clockEl.classList.remove('is-zero'), 520);
  } else if (sec > 0) {
    delete clockEl.dataset.shaken;
  }
}

// =========================================================================
// #095 — MORPHING GRADE BAR CHART
// =========================================================================
const prevChartHeights = new Map();

export function renderMorphBarChartHtml(
  buckets,
  { key = 'gb-stats', title = 'Phổ điểm xếp loại', avgLabel = 'ĐTB', avgVal = '—', summaryRight = '' } = {}
) {
  const safeKey = escHtml(key);
  return `
    <div class="u095-chart" data-u095-key="${safeKey}">
      <div class="u095-head">
        <div class="u095-head-left">
          <div class="u095-kicker" data-u095-kicker>${escHtml(title)}</div>
          <div class="u095-big" data-u095-big>${escHtml(avgLabel)}: <strong>${escHtml(avgVal)}</strong></div>
        </div>
        <div class="u095-right" data-u095-right>${summaryRight}</div>
      </div>
      <div class="u095-stage">
        <div class="u095-gridlines" aria-hidden="true">
          <span></span><span></span><span></span>
        </div>
        <div class="u095-bars">
          ${buckets
            .map(
              (b, idx) => `
            <div
              class="u095-col"
              tabindex="0"
              data-u095-idx="${idx}"
              data-u095-label="${escHtml(b.label)}"
              data-u095-count="${b.count}"
              data-u095-pct="${b.pct.toFixed(1)}"
              data-u095-delta="${escHtml(b.deltaText || '')}"
            >
              <span class="u095-val">${b.count}</span>
              <div class="u095-bar-slot">
                <div class="u095-bar ${escHtml(b.cls || '')}" data-u095-bar="${idx}" style="height:0%;"></div>
              </div>
              <span class="u095-lbl">${escHtml(b.shortLabel || b.label)}</span>
              <span class="u095-pct">${b.pct.toFixed(1).replace('.', ',')}%</span>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    </div>
  `;
}

export function bindMorphBarChart(rootEl, buckets, { key = 'gb-stats', title = 'Phổ điểm xếp loại', avgLabel = 'ĐTB', avgVal = '—', summaryRight = '' } = {}) {
  const chart = rootEl?.querySelector(`[data-u095-key="${key}"]`);
  if (!chart) return;

  const maxPct = Math.max(25, ...buckets.map((b) => Number(b.pct) || 0));
  const targetHeights = buckets.map((b) =>
    b.count > 0 ? Math.max(8, Math.min(100, Math.round((b.pct / maxPct) * 100))) : 0
  );
  const prev = prevChartHeights.get(key) || targetHeights.map(() => 0);

  const barEls = chart.querySelectorAll('[data-u095-bar]');
  barEls.forEach((bar, i) => {
    bar.style.transition = 'none';
    bar.style.height = `${prev[i] ?? 0}%`;
  });
  void chart.offsetWidth;
  requestAnimationFrame(() => {
    barEls.forEach((bar, i) => {
      bar.style.transition = '';
      bar.style.height = `${targetHeights[i]}%`;
    });
  });
  prevChartHeights.set(key, targetHeights);

  const kickerEl = chart.querySelector('[data-u095-kicker]');
  const bigEl = chart.querySelector('[data-u095-big]');
  const rightEl = chart.querySelector('[data-u095-right]');
  const defaultBigHtml = `${escHtml(avgLabel)}: <strong>${escHtml(avgVal)}</strong>`;

  const cols = chart.querySelectorAll('.u095-col');
  const setFocus = (col) => {
    if (!col) {
      chart.classList.remove('is-scrubbing');
      cols.forEach((c) => c.classList.remove('is-hot'));
      if (kickerEl) kickerEl.textContent = title;
      if (bigEl) bigEl.innerHTML = defaultBigHtml;
      if (rightEl) rightEl.innerHTML = summaryRight;
      return;
    }
    chart.classList.add('is-scrubbing');
    cols.forEach((c) => c.classList.toggle('is-hot', c === col));
    const lbl = col.dataset.u095Label;
    const cnt = col.dataset.u095Count;
    const pct = String(col.dataset.u095Pct || '0').replace('.', ',');
    const delta = col.dataset.u095Delta;
    if (kickerEl) kickerEl.textContent = lbl;
    if (bigEl) bigEl.innerHTML = `<strong>${escHtml(cnt)} HS</strong> <span class="u095-big-sub">(${escHtml(pct)}%)</span>`;
    if (rightEl) rightEl.innerHTML = delta ? `<span class="u095-delta-pill">${escHtml(delta)}</span>` : summaryRight;
  };

  cols.forEach((col) => {
    col.addEventListener('mouseenter', () => setFocus(col));
    col.addEventListener('focus', () => setFocus(col));
    col.addEventListener('blur', () => setFocus(null));
  });
  chart.querySelector('.u095-bars')?.addEventListener('mouseleave', () => setFocus(null));
}

// =========================================================================
// #472 — SEGMENTED STORAGE METER (Supabase 500 MB)
// =========================================================================
export function buildStorageSegments(stats) {
  const bd = stats.breakdown || {};
  const quotaBytes = 500 * 1024 * 1024;
  const rawSegs = [
    { key: 'files', label: 'Tệp đính kèm (PDF, ảnh...)', short: 'PDF / Ảnh', color: '#2563EB', bytes: Number(bd.files?.bytes || 0), sub: `${bd.files?.count || 0} tệp` },
    { key: 'models', label: 'Mô hình tương tác (.html)', short: 'Mô hình HTML', color: '#7C3AED', bytes: Number(bd.models?.bytes || 0), sub: `${bd.models?.count || 0} mô hình` },
    { key: 'exams', label: 'Ngân hàng đề thi', short: 'Đề thi', color: '#119C72', bytes: Number(bd.exams?.bytes || 0), sub: `${bd.exams?.count || 0} đề thi` },
    { key: 'other', label: 'Bài viết, HS & Bài nộp', short: 'Khác', color: '#F59E0B', bytes: Number(bd.other?.bytes || 0), sub: `${bd.other?.postsCount || 0} bài viết` },
  ];

  // Give non-zero segments a small visible minimum width on the track while keeping exact % in labels
  const totalBytes = Number(stats.totalBytes || 0);
  const usedPct = Math.min(100, (totalBytes / quotaBytes) * 100);
  const visibleSumBytes = rawSegs.reduce((a, s) => a + s.bytes, 0) || 1;
  const visualUsedPct = totalBytes > 0 ? Math.max(usedPct, Math.min(28, rawSegs.filter((s) => s.bytes > 0).length * 4.5)) : 0;

  return rawSegs.map((s) => {
    const exactPct = (s.bytes / quotaBytes) * 100;
    const shareOfUsed = totalBytes > 0 ? (s.bytes / visibleSumBytes) * 100 : 0;
    const visualPct = s.bytes > 0 ? Math.max(2.2, (s.bytes / visibleSumBytes) * visualUsedPct) : 0;
    return { ...s, exactPct, shareOfUsed, visualPct };
  });
}

export function renderSegmentedStorageMeterHtml(stats, formatBytesFn) {
  const segs = buildStorageSegments(stats);
  const pct = Math.min(100, Number(stats.percentUsed) || 0);

  return `
    <div class="u472-meter" id="u472Meter">
      <div class="u472-readout">
        <span class="u472-r-label" id="u472ReadoutLabel">Tổng dung lượng đã dùng</span>
        <span class="u472-r-val" id="u472ReadoutVal">
          <strong>${escHtml(formatBytesFn(stats.totalBytes))}</strong>
          <span>/ 500 MB (${String(pct).replace('.', ',')}%)</span>
        </span>
      </div>
      <div class="u472-track" id="u472Track">
        ${segs
          .map(
            (s, i) => `
          <button
            type="button"
            class="u472-seg ${s.bytes === 0 ? 'is-zero' : ''}"
            data-u472-key="${s.key}"
            data-target-w="${s.visualPct.toFixed(2)}"
            style="width:0%; background:${s.color}; --i:${i};"
            title="${escHtml(s.label)}: ${escHtml(formatBytesFn(s.bytes))}"
            aria-label="${escHtml(s.label)}: ${escHtml(formatBytesFn(s.bytes))}"
          ></button>
        `
          )
          .join('')}
      </div>
      <div class="u472-legend">
        ${segs
          .map(
            (s) => `
          <button type="button" class="u472-leg-btn" data-u472-key="${s.key}">
            <span class="u472-dot" style="background:${s.color};"></span>
            <span>${escHtml(s.short)}</span>
            <b>${escHtml(formatBytesFn(s.bytes))}</b>
          </button>
        `
          )
          .join('')}
      </div>
    </div>
  `;
}

export function bindSegmentedStorageMeter(containerEl, stats, formatBytesFn) {
  const meter = containerEl?.querySelector('#u472Meter');
  if (!meter) return;
  const segs = buildStorageSegments(stats);
  const segMap = new Map(segs.map((s) => [s.key, s]));
  const pct = Math.min(100, Number(stats.percentUsed) || 0);

  const track = meter.querySelector('#u472Track');
  const lblEl = meter.querySelector('#u472ReadoutLabel');
  const valEl = meter.querySelector('#u472ReadoutVal');
  const defaultValHtml = `<strong>${escHtml(formatBytesFn(stats.totalBytes))}</strong> <span>/ 500 MB (${String(pct).replace('.', ',')}%)</span>`;

  // Sequential grow-in animation on open
  requestAnimationFrame(() => {
    track.querySelectorAll('.u472-seg').forEach((el) => {
      el.style.width = `${el.dataset.targetW || 0}%`;
    });
  });

  const allTargets = containerEl.querySelectorAll('[data-u472-key]');
  function focusKey(key) {
    if (!key || !segMap.has(key)) {
      meter.classList.remove('is-focus');
      allTargets.forEach((el) => el.classList.remove('is-hot'));
      if (lblEl) lblEl.textContent = 'Tổng dung lượng đã dùng';
      if (valEl) valEl.innerHTML = defaultValHtml;
      return;
    }
    const s = segMap.get(key);
    meter.classList.add('is-focus');
    allTargets.forEach((el) => el.classList.toggle('is-hot', el.dataset.u472Key === key));
    if (lblEl) lblEl.textContent = `${s.label} (${s.sub})`;
    if (valEl) {
      valEl.innerHTML = `<strong>${escHtml(formatBytesFn(s.bytes))}</strong> <span>(${s.shareOfUsed.toFixed(1).replace('.', ',')}% phần đã dùng · ${s.exactPct.toFixed(2).replace('.', ',')}% hạn mức)</span>`;
    }
  }

  allTargets.forEach((el) => {
    el.addEventListener('mouseenter', () => focusKey(el.dataset.u472Key));
    el.addEventListener('focus', () => focusKey(el.dataset.u472Key));
    el.addEventListener('mouseleave', () => focusKey(null));
    el.addEventListener('blur', () => focusKey(null));
  });
}

// =========================================================================
// ANIMATE UI — CHECKBOX (Box Fill 0.7->1 + SVG Stroke Draw/Erase)
// =========================================================================
function enhanceCheckbox(input) {
  if (!input || input.tagName !== 'INPUT' || input.type !== 'checkbox') return;
  if (input.dataset.auiChk === '1' || input.dataset.auiSkip === '1') return;
  if (!input.parentNode) return;
  input.dataset.auiChk = '1';

  const host = document.createElement('span');
  host.className = 'aui-chk-host';
  if (input.disabled) host.classList.add('is-disabled');

  input.parentNode.insertBefore(host, input);
  host.appendChild(input);
  input.classList.add('aui-chk-native');

  const box = document.createElement('span');
  box.className = 'aui-chk-box';
  box.setAttribute('aria-hidden', 'true');
  box.innerHTML = `<svg class="aui-chk-svg" viewBox="0 0 16 16"><path class="aui-chk-path" d="M3.2 8.4 L6.6 11.8 L12.8 4.6"/></svg>`;
  host.appendChild(box);

  // Pre-checked boxes render at rest on mount; enable transitions on subsequent interactions
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (host.isConnected) host.classList.add('is-ready');
    });
  });
}

// =========================================================================
// ANIMATE UI — COMBOBOX (Scale/Fade Popup + Staggered Blur Rows +
// Gliding Spring Highlight + Check Draw + Value Rise/Blur Swap)
// =========================================================================
let activeComboboxClose = null;

function enhanceSelectToCombobox(selectEl) {
  if (!selectEl || selectEl.tagName !== 'SELECT') return;
  if (selectEl.multiple || selectEl.dataset.auiCb === '1' || selectEl.dataset.auiSkip === '1') return;
  if (!selectEl.parentNode) return;
  selectEl.dataset.auiCb = '1';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'aui-cb-trigger';
  if (selectEl.classList.contains('input-compact')) trigger.classList.add('is-compact');
  if (selectEl.style.width) trigger.style.width = selectEl.style.width;
  if (selectEl.style.minWidth) trigger.style.minWidth = selectEl.style.minWidth;
  if (selectEl.style.maxWidth) trigger.style.maxWidth = selectEl.style.maxWidth;
  if (selectEl.style.flex) trigger.style.flex = selectEl.style.flex;
  if (selectEl.title) trigger.title = selectEl.title;
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.disabled = selectEl.disabled;

  const getSelectedText = () => {
    const opt = selectEl.options[selectEl.selectedIndex];
    return opt ? opt.textContent.trim() : '';
  };

  trigger.innerHTML = `
    <span class="aui-cb-val-slot">
      <span class="aui-cb-val-cur">${escHtml(getSelectedText())}</span>
    </span>
    <svg class="aui-cb-chev" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  `;

  selectEl.classList.add('aui-cb-native');
  selectEl.tabIndex = -1;
  selectEl.setAttribute('aria-hidden', 'true');
  selectEl.parentNode.insertBefore(trigger, selectEl.nextSibling);

  let lastDisplayedText = getSelectedText();
  let popupEl = null;
  let isOpen = false;
  let closeTimer = null;
  let holdTimer = null;
  let activeIdx = -1;
  let filteredOpts = [];

  function syncTriggerLabel(animate = false) {
    const nextText = getSelectedText();
    trigger.disabled = selectEl.disabled;
    trigger.classList.toggle('hidden', selectEl.classList.contains('hidden'));
    if (nextText === lastDisplayedText) return;
    const slot = trigger.querySelector('.aui-cb-val-slot');
    if (!slot) return;

    if (!animate || REDUCED_MOTION()) {
      slot.innerHTML = `<span class="aui-cb-val-cur">${escHtml(nextText)}</span>`;
      lastDisplayedText = nextText;
      return;
    }

    const oldEl = slot.querySelector('.aui-cb-val-cur');
    if (oldEl) {
      oldEl.className = 'aui-cb-val-out';
      setTimeout(() => oldEl.remove(), 520);
    }
    const newEl = document.createElement('span');
    newEl.className = 'aui-cb-val-cur aui-cb-val-in';
    newEl.textContent = nextText;
    slot.appendChild(newEl);
    setTimeout(() => newEl.classList.remove('aui-cb-val-in'), 530);
    lastDisplayedText = nextText;
  }

  selectEl.addEventListener('change', () => syncTriggerLabel(false));

  const optObserver = new MutationObserver(() => {
    if (!selectEl.isConnected) {
      optObserver.disconnect();
      trigger.remove();
      closePopup(true);
      return;
    }
    syncTriggerLabel(false);
  });
  optObserver.observe(selectEl, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'class'] });

  function getAllOptions() {
    return Array.from(selectEl.options).map((o, idx) => ({
      index: idx,
      value: o.value,
      label: o.textContent.trim(),
      disabled: o.disabled,
      selected: o.selected,
    }));
  }

  function moveHighlight(listEl, hlEl, rowEl, instant = false) {
    if (!hlEl || !rowEl) {
      if (hlEl) hlEl.style.opacity = '0';
      return;
    }
    const top = rowEl.offsetTop;
    const h = rowEl.offsetHeight;
    if (instant || REDUCED_MOTION() || hlEl.style.opacity !== '1') {
      hlEl.style.transition = 'opacity 0.18s ease';
      hlEl.style.transform = `translate3d(0, ${top}px, 0)`;
      hlEl.style.height = `${h}px`;
      hlEl.style.opacity = '1';
      void hlEl.offsetWidth;
      hlEl.style.transition = '';
    } else {
      hlEl.style.transform = `translate3d(0, ${top}px, 0)`;
      hlEl.style.height = `${h}px`;
      hlEl.style.opacity = '1';
    }
  }

  function closePopup(immediate = false) {
    clearTimeout(holdTimer);
    if (!popupEl) {
      isOpen = false;
      trigger.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
      return;
    }
    isOpen = false;
    trigger.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
    if (activeComboboxClose === closePopup) activeComboboxClose = null;

    document.removeEventListener('pointerdown', onOutsidePointer, true);
    document.removeEventListener('keydown', onPopupKeydown, true);
    window.removeEventListener('resize', onReposition);
    window.removeEventListener('scroll', onScrollClose, true);

    const closingEl = popupEl;
    popupEl = null;
    if (immediate || REDUCED_MOTION()) {
      closingEl.remove();
      return;
    }
    closingEl.classList.remove('is-open');
    closingEl.classList.add('is-closing');
    closeTimer = setTimeout(() => closingEl.remove(), 290);
  }

  function onOutsidePointer(e) {
    if (!popupEl) return;
    if (popupEl.contains(e.target) || trigger.contains(e.target)) return;
    closePopup(false);
  }

  function onScrollClose(e) {
    if (popupEl && popupEl.contains(e.target)) return;
    closePopup(false);
  }

  function onReposition() {
    if (!popupEl || !trigger.isConnected) {
      closePopup(true);
      return;
    }
    positionPopup(popupEl);
  }

  function positionPopup(el) {
    const r = trigger.getBoundingClientRect();
    const minW = Math.max(Math.ceil(r.width) + 28, 224);
    const maxW = Math.min(380, window.innerWidth - 20);
    const width = Math.min(maxW, Math.max(minW, r.width));
    let left = r.left;
    if (left + width > window.innerWidth - 10) {
      left = Math.max(10, window.innerWidth - 10 - width);
    }

    const spaceBelow = window.innerHeight - r.bottom - 12;
    const spaceAbove = r.top - 12;
    const openUp = spaceBelow < 210 && spaceAbove > spaceBelow;
    const maxH = Math.max(130, Math.min(310, (openUp ? spaceAbove : spaceBelow) - 8));

    el.style.width = `${Math.round(width)}px`;
    el.style.left = `${Math.round(left)}px`;
    const listEl = el.querySelector('.aui-cb-list');
    if (listEl) listEl.style.maxHeight = `${Math.round(maxH)}px`;

    if (openUp) {
      el.style.top = '';
      el.style.bottom = `${Math.round(window.innerHeight - r.top + 6)}px`;
      el.style.setProperty('--aui-origin', 'bottom center');
    } else {
      el.style.bottom = '';
      el.style.top = `${Math.round(r.bottom + 6)}px`;
      el.style.setProperty('--aui-origin', 'top center');
    }
  }

  function pickOption(opt, rowEl) {
    if (!opt || opt.disabled) return;
    const changed = selectEl.value !== opt.value;
    if (!changed) {
      closePopup(false);
      trigger.focus({ preventScroll: true });
      return;
    }

    // Animate check draw on newly picked row & erase on previous row before holding briefly then closing
    if (popupEl) {
      popupEl.querySelectorAll('.aui-cb-item.is-selected').forEach((r) => {
        r.classList.remove('is-selected');
        r.classList.add('is-deselecting');
        r.setAttribute('aria-selected', 'false');
      });
      if (rowEl) {
        rowEl.classList.remove('is-deselecting');
        rowEl.classList.add('is-selected', 'is-drawing');
        rowEl.setAttribute('aria-selected', 'true');
      }
    }

    selectEl.value = opt.value;
    syncTriggerLabel(true);
    selectEl.dispatchEvent(new Event('change', { bubbles: true }));

    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      closePopup(false);
      if (trigger.isConnected) trigger.focus({ preventScroll: true });
    }, REDUCED_MOTION() ? 0 : 300);
  }

  function onPopupKeydown(e) {
    if (!popupEl) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closePopup(false);
      trigger.focus({ preventScroll: true });
      return;
    }
    const listEl = popupEl.querySelector('.aui-cb-list');
    const hlEl = popupEl.querySelector('.aui-cb-hl');
    const rows = Array.from(popupEl.querySelectorAll('.aui-cb-item:not(.is-disabled)'));
    if (!rows.length) return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      activeIdx = activeIdx < 0 ? (dir > 0 ? 0 : rows.length - 1) : (activeIdx + dir + rows.length) % rows.length;
      const targetRow = rows[activeIdx];
      targetRow.scrollIntoView({ block: 'nearest' });
      moveHighlight(listEl, hlEl, targetRow, false);
    } else if (e.key === 'Enter') {
      if (activeIdx >= 0 && rows[activeIdx]) {
        e.preventDefault();
        const optIdx = Number(rows[activeIdx].dataset.optIndex);
        const match = filteredOpts.find((o) => o.index === optIdx);
        pickOption(match, rows[activeIdx]);
      }
    }
  }

  function openPopup() {
    if (trigger.disabled) return;
    if (isOpen) {
      closePopup(false);
      return;
    }
    if (activeComboboxClose && activeComboboxClose !== closePopup) {
      activeComboboxClose(true);
    }
    clearTimeout(closeTimer);

    const allOpts = getAllOptions();
    filteredOpts = allOpts;
    const showSearch = allOpts.length >= 6 || selectEl.dataset.searchable === '1';

    const el = document.createElement('div');
    el.className = 'aui-cb-popup';
    el.setAttribute('role', 'listbox');
    el.innerHTML = `
      ${
        showSearch
          ? `<div class="aui-cb-search-wrap">
               <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
                 <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
               </svg>
               <input type="search" class="aui-cb-search" placeholder="Tìm nhanh..." aria-label="Tìm nhanh lựa chọn" />
             </div>`
          : ''
      }
      <div class="aui-cb-list">
        <div class="aui-cb-hl" aria-hidden="true"></div>
        <div class="aui-cb-rows"></div>
      </div>
    `;

    const listEl = el.querySelector('.aui-cb-list');
    const hlEl = el.querySelector('.aui-cb-hl');
    const rowsEl = el.querySelector('.aui-cb-rows');
    const searchEl = el.querySelector('.aui-cb-search');

    function renderRows(opts, stagger = false) {
      filteredOpts = opts;
      if (!opts.length) {
        rowsEl.innerHTML = `<div class="aui-cb-empty">Không tìm thấy lựa chọn phù hợp</div>`;
        hlEl.style.opacity = '0';
        activeIdx = -1;
        return;
      }
      const stepMs = opts.length > 10 ? Math.round(48 * Math.sqrt(10 / opts.length)) : 48;
      rowsEl.innerHTML = opts
        .map(
          (o, i) => `
        <button
          type="button"
          class="aui-cb-item ${o.selected ? 'is-selected' : ''} ${o.disabled ? 'is-disabled' : ''} ${stagger ? 'is-stagger' : ''}"
          role="option"
          aria-selected="${o.selected ? 'true' : 'false'}"
          data-opt-index="${o.index}"
          ${o.disabled ? 'disabled' : ''}
          style="${stagger ? `--d:${i * stepMs}ms;` : ''}"
        >
          <span class="aui-cb-item-lbl">${escHtml(o.label)}</span>
          <span class="aui-cb-ind" aria-hidden="true">
            <svg viewBox="0 0 16 16"><path d="M3.2 8.4 L6.6 11.8 L12.8 4.6"/></svg>
          </span>
        </button>
      `
        )
        .join('');

      const itemEls = Array.from(rowsEl.querySelectorAll('.aui-cb-item:not(.is-disabled)'));
      const selPos = itemEls.findIndex((r) => r.classList.contains('is-selected'));
      activeIdx = selPos >= 0 ? selPos : 0;

      itemEls.forEach((row, idx) => {
        row.addEventListener('pointerenter', () => {
          activeIdx = idx;
          moveHighlight(listEl, hlEl, row, false);
        });
        row.addEventListener('click', () => {
          const optIdx = Number(row.dataset.optIndex);
          const match = filteredOpts.find((o) => o.index === optIdx);
          pickOption(match, row);
        });
      });

      requestAnimationFrame(() => {
        if (itemEls[activeIdx]) {
          itemEls[activeIdx].scrollIntoView({ block: 'nearest' });
          moveHighlight(listEl, hlEl, itemEls[activeIdx], true);
        }
      });
    }

    renderRows(allOpts, !REDUCED_MOTION());

    if (searchEl) {
      searchEl.addEventListener('input', () => {
        const q = searchEl.value.trim().toLowerCase();
        const next = q ? allOpts.filter((o) => o.label.toLowerCase().includes(q)) : allOpts;
        renderRows(next, false);
      });
    }

    document.body.appendChild(el);
    popupEl = el;
    isOpen = true;
    activeComboboxClose = closePopup;
    trigger.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    positionPopup(el);

    void el.offsetWidth;
    el.classList.add('is-open');

    if (searchEl) {
      setTimeout(() => searchEl.focus({ preventScroll: true }), 40);
    }

    document.addEventListener('pointerdown', onOutsidePointer, true);
    document.addEventListener('keydown', onPopupKeydown, true);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onScrollClose, true);
  }

  trigger.addEventListener('click', openPopup);
  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === ' ') {
      if (!isOpen) {
        e.preventDefault();
        openPopup();
      }
    }
  });
}

let animateUiBooted = false;

export function scanAnimateUiPrimitives(root = document.body) {
  if (!root || root.nodeType !== 1) return;
  if (root.matches?.('input[type="checkbox"]')) enhanceCheckbox(root);
  if (root.matches?.('select')) enhanceSelectToCombobox(root);
  root.querySelectorAll?.('input[type="checkbox"]:not([data-aui-chk="1"])').forEach(enhanceCheckbox);
  root.querySelectorAll?.('select:not([data-aui-cb="1"])').forEach(enhanceSelectToCombobox);
}

export function initAnimateUiPrimitives() {
  if (animateUiBooted) {
    scanAnimateUiPrimitives(document.body);
    return;
  }
  animateUiBooted = true;
  scanAnimateUiPrimitives(document.body);

  let pending = false;
  const mo = new MutationObserver((mutations) => {
    let hasAdded = false;
    for (const m of mutations) {
      if (m.addedNodes && m.addedNodes.length > 0) {
        hasAdded = true;
        break;
      }
    }
    if (!hasAdded || pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      scanAnimateUiPrimitives(document.body);
    });
  });
  mo.observe(document.body, { childList: true, subtree: true });
}

