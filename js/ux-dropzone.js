import { escapeHtml, escapeAttr } from './exam-engine.js?v=20261123d';

const EXT_COLORS = {
  pdf: '#E5484D',
  png: '#8E4EC6',
  jpg: '#0090FF',
  jpeg: '#0090FF',
  webp: '#8E4EC6',
  gif: '#8E4EC6',
  doc: '#2B63D9',
  docx: '#2B63D9',
  xls: '#15803D',
  xlsx: '#15803D',
  ppt: '#D97706',
  pptx: '#D97706',
  html: '#6A57F2',
  htm: '#6A57F2',
  tex: '#0F766E',
  txt: '#475569',
  mp4: '#E11D48',
  mp3: '#7C3AED',
  zip: '#C27A12',
  rar: '#C27A12',
};

function formatFileSize(bytes) {
  if (bytes < 1048576) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / 1048576).toFixed(1)}MB`;
}

/**
 * Center-crop any image (regardless of original resolution or file size) into a
 * compact 160x160 square JPEG data URL (~5-10 KB) ideal for small circular avatars.
 */
export async function compressAvatarImage(file, size = 160, quality = 0.72) {
  if (!file || !String(file.type || '').startsWith('image/')) {
    throw new Error('Vui lòng chọn tệp hình ảnh (.jpg, .png, .webp...).');
  }

  let source = null;
  let sw = 0;
  let sh = 0;
  let cleanup = () => {};

  if (typeof window.createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file);
      source = bmp;
      sw = bmp.width;
      sh = bmp.height;
      cleanup = () => bmp.close?.();
    } catch {
      source = null;
    }
  }

  if (!source) {
    const objUrl = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Không thể đọc định dạng ảnh này.'));
        el.src = objUrl;
      });
      source = img;
      sw = img.naturalWidth || img.width;
      sh = img.naturalHeight || img.height;
      cleanup = () => URL.revokeObjectURL(objUrl);
    } catch (err) {
      URL.revokeObjectURL(objUrl);
      throw err;
    }
  }

  try {
    if (!sw || !sh) throw new Error('Ảnh không hợp lệ.');
    const side = Math.min(sw, sh);
    const sx = Math.floor((sw - side) / 2);
    const sy = Math.floor((sh - side) / 2);

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, sx, sy, side, side, 0, 0, size, size);

    let dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (dataUrl.length > 36000) {
      dataUrl = canvas.toDataURL('image/jpeg', 0.55);
    }
    if (dataUrl.length > 60000) {
      canvas.width = 120;
      canvas.height = 120;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 120, 120);
      ctx.drawImage(source, sx, sy, side, side, 0, 0, 120, 120);
      dataUrl = canvas.toDataURL('image/jpeg', 0.55);
    }
    return dataUrl;
  } finally {
    cleanup();
  }
}

/**
 * Mount a Lucian #432 animated file dropzone into `containerEl`.
 * Supports single or multiple files, compact layout, unlimited size (maxBytes: null),
 * document drop-in animation, circular SVG progress ring, mint checkmark pop,
 * and optional selected-file / thumbnail idle preview.
 */
export function mountAnimatedDropzone(
  containerEl,
  {
    inputId = '',
    accept = '.pdf,application/pdf',
    multiple = false,
    compact = false,
    idleTitle = 'Kéo thả file vào đây',
    dragTitle = 'Thả file để tải lên',
    subNote = '',
    hintText = '',
    maxBytes = 10 * 1024 * 1024, // null / Infinity for no limit
    initialSelectedText = '',
    initialThumbUrl = '',
    onProcess, // async (file) => result (single file)
    onProcessFiles, // async (files[]) => result (multi file)
    onComplete, // (result, filesOrFile) => void
    onError, // (err, filesOrFile) => void
  } = {}
) {
  if (!containerEl) return null;
  const hasLimit = Number.isFinite(maxBytes) && maxBytes > 0;
  const maxMb = hasLimit ? Math.round(maxBytes / 1048576) : 0;
  const defaultSubRight = subNote || (hasLimit ? `tối đa ${maxMb} MB` : 'không giới hạn dung lượng');

  containerEl.innerHTML = `
    <div class="ux u432-wrap ${compact ? 'is-compact' : ''}">
      <div class="u432-dz" tabindex="0" role="button" aria-label="${escapeAttr(idleTitle)}">
        <div class="u432-idle">
          <div class="u432-thumb-slot ${initialThumbUrl ? '' : 'hidden'}">
            ${initialThumbUrl ? `<img src="${escapeAttr(initialThumbUrl)}" alt="Xem trước" class="u432-thumb-img" />` : ''}
          </div>
          <span class="u432-ar ${initialThumbUrl ? 'hidden' : ''}" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M12 16V5M7 9.5 12 4.5l5 5"/>
              <path d="M5 15v2.5A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5V15"/>
            </svg>
          </span>
          <b class="u432-idle-title">${escapeHtml(initialSelectedText || idleTitle)}</b>
          <b aria-hidden="true">${escapeHtml(dragTitle)}</b>
          <small>hoặc <button type="button" class="u432-br" tabindex="-1">chọn tệp</button> · ${escapeHtml(defaultSubRight)}</small>
          ${hintText ? `<span class="u432-hint">${hintText}</span>` : ''}
        </div>
        <div class="u432-up" aria-hidden="true">
          <div class="u432-st">
            <svg class="u432-ring" viewBox="0 0 100 100">
              <circle class="tk" cx="50" cy="50" r="46"/>
              <circle class="pg" cx="50" cy="50" r="46"/>
            </svg>
            <svg class="u432-doc" viewBox="0 0 50 62">
              <path class="pp" d="M6 1h26l15 15v39a6 6 0 0 1-6 6H6a6 6 0 0 1-6-6V7a6 6 0 0 1 6-6z"/>
              <path class="fd" d="M32 1v10a5 5 0 0 0 5 5h10z"/>
              <rect class="ln" x="9" y="22" width="24" height="3" rx="1.5"/>
              <rect class="ln" x="9" y="29" width="30" height="3" rx="1.5"/>
              <rect class="tg" x="-4" y="40" width="28" height="14" rx="3.5"/>
              <text x="10" y="50" text-anchor="middle">FILE</text>
            </svg>
            <span class="u432-ok">
              <svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>
            </span>
          </div>
          <p class="u432-nm"></p>
        </div>
        <input class="u432-file" ${inputId ? `id="${escapeAttr(inputId)}"` : ''} type="file" accept="${escapeAttr(accept)}" ${multiple ? 'multiple' : ''} tabindex="-1" aria-hidden="true" />
      </div>
      <p class="u432-live" role="status"></p>
    </div>
  `;

  const root = containerEl.querySelector('.u432-wrap');
  const dz = root.querySelector('.u432-dz');
  const ring = root.querySelector('.u432-ring .pg');
  const nm = root.querySelector('.u432-nm');
  const tag = root.querySelector('.u432-doc .tg');
  const tagT = root.querySelector('.u432-doc text');
  const fileInp = root.querySelector('.u432-file');
  const live = root.querySelector('.u432-live');
  const idleTitleEl = root.querySelector('.u432-idle-title');
  const thumbSlot = root.querySelector('.u432-thumb-slot');
  const arrowEl = root.querySelector('.u432-ar');
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

  let busy = false;
  let rafId = 0;

  function resetToIdle(delayMs) {
    setTimeout(() => {
      if (!root.isConnected) return;
      root.classList.add('is-out');
      setTimeout(() => {
        if (!root.isConnected) return;
        root.classList.remove('is-up', 'is-done', 'is-out', 'is-err');
        busy = false;
      }, 300);
    }, delayMs);
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []).filter(Boolean);
    if (busy || files.length === 0) return;
    busy = true;

    const first = files[0];
    const ext = (/\.([a-z0-9]+)$/i.exec(first.name) || [, 'file'])[1].toLowerCase();
    tag.style.setProperty('--c', EXT_COLORS[ext] || '#6B7280');
    tagT.textContent = files.length > 1 ? `${files.length} FILE` : ext.slice(0, 4).toUpperCase();

    root.classList.remove('is-done', 'is-out', 'is-err', 'is-drag');
    root.classList.add('is-up');
    ring.style.strokeDashoffset = '289';

    const totalSize = files.reduce((s, f) => s + (f.size || 0), 0);
    const displayName = files.length > 1 ? `${files.length} tệp đã chọn` : first.name;
    nm.innerHTML = `${escapeHtml(displayName)} <small>· 0%</small>`;

    const oversized = hasLimit ? files.find((f) => f.size > maxBytes) : null;
    const minSweepMs = reducedMotion ? 200 : 880;
    const startDelay = reducedMotion ? 0 : 250;
    const t0 = performance.now() + startDelay;

    let workDone = false;
    let workResult = null;
    let workError = null;

    if (!oversized) {
      const workPromise =
        typeof onProcessFiles === 'function'
          ? Promise.resolve().then(() => onProcessFiles(files))
          : typeof onProcess === 'function'
            ? Promise.resolve().then(() => onProcess(first))
            : Promise.resolve(multiple ? files : first);

      workPromise
        .then((res) => {
          workResult = res;
          workDone = true;
        })
        .catch((err) => {
          workError = err || new Error('Không thể đọc tệp.');
          workDone = true;
        });
    } else {
      workDone = true;
    }

    cancelAnimationFrame(rafId);

    const step = (now) => {
      if (!root.isConnected) return;
      const rawK = Math.max(0, (now - t0) / minSweepMs);
      let k = Math.min(1, rawK);
      if (!workDone && !oversized && k > 0.92) {
        k = 0.92;
      }
      let eased = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      if (oversized) eased = Math.min(eased, 0.22);

      ring.style.strokeDashoffset = (289 * (1 - eased)).toFixed(1);
      const smallEl = nm.querySelector('small');
      if (smallEl) smallEl.textContent = `· ${Math.round(eased * 100)}%`;

      if (rawK < 1 || (!oversized && !workDone)) {
        rafId = requestAnimationFrame(step);
        return;
      }

      if (oversized) {
        root.classList.add('is-err');
        const msg = `Vượt quá ${maxMb} MB`;
        if (smallEl) smallEl.textContent = `· ${msg}`;
        live.textContent = msg;
        if (typeof onError === 'function') {
          onError(new Error(`Tệp "${oversized.name}" vượt quá giới hạn ${maxMb} MB.`), multiple ? files : first);
        }
        resetToIdle(1400);
        return;
      }

      if (workError) {
        root.classList.add('is-err');
        if (smallEl) smallEl.textContent = '· Lỗi tải tệp';
        live.textContent = workError.message || 'Lỗi tải tệp';
        if (typeof onError === 'function') onError(workError, multiple ? files : first);
        resetToIdle(1400);
        return;
      }

      ring.style.strokeDashoffset = '0';
      root.classList.add('is-done');
      if (smallEl) smallEl.textContent = `· ${formatFileSize(totalSize)}`;
      live.textContent = `${displayName} đã tải xong`;

      setTimeout(() => {
        if (!root.isConnected) return;
        if (typeof onComplete === 'function') {
          onComplete(workResult, multiple ? files : first);
        }
        if (root.isConnected) {
          resetToIdle(650);
        }
      }, reducedMotion ? 200 : 560);
    };

    rafId = requestAnimationFrame(step);
  }

  dz.addEventListener('click', (e) => {
    if (!busy && e.target !== fileInp) fileInp.click();
  });
  dz.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && !busy) {
      e.preventDefault();
      fileInp.click();
    }
  });
  fileInp.addEventListener('change', () => {
    const picked = Array.from(fileInp.files || []);
    fileInp.value = '';
    if (picked.length > 0) handleFiles(picked);
  });

  let dragDepth = 0;
  dz.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragDepth += 1;
    if (!busy) root.classList.add('is-drag');
  });
  dz.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });
  dz.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) root.classList.remove('is-drag');
  });
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    root.classList.remove('is-drag');
    if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
  });

  return {
    fileInput: fileInp,
    setIdleTitle(text) {
      if (idleTitleEl) idleTitleEl.textContent = text || idleTitle;
    },
    setThumbPreview(url) {
      if (!thumbSlot || !arrowEl) return;
      if (url) {
        thumbSlot.innerHTML = `<img src="${escapeAttr(url)}" alt="Xem trước" class="u432-thumb-img" />`;
        thumbSlot.classList.remove('hidden');
        arrowEl.classList.add('hidden');
      } else {
        thumbSlot.innerHTML = '';
        thumbSlot.classList.add('hidden');
        arrowEl.classList.remove('hidden');
      }
    },
  };
}
