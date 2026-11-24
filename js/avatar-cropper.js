/**
 * Lucian UX/UI #069 — Interactive Circular Avatar Cropper
 * Supports pointer drag/pan, wheel zoom, range slider zoom (100%-300%),
 * 90° rotation, keyboard navigation, rule-of-thirds grid while dragging,
 * flying-circle save animation, and exact 160x160 compressed JPEG export.
 */

function escapeHtmlBasic(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Không thể đọc tệp ảnh này. Vui lòng chọn ảnh JPG, PNG hoặc WebP.'));
    img.src = src;
  });
}

export function mountAvatarCropper(
  hostEl,
  {
    source = null,
    initialPreviewUrl = '',
    initials = 'U',
    isAdmin = false,
    onApply = null,
    onCancel = null,
    onError = null,
  } = {}
) {
  if (!hostEl) return null;

  const STAGE = 280;
  const HOLE = 240;
  const ME_SIZE = 52;
  const rm = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  let objectUrl = null;
  let currentImgSrc = '';
  let loadedImg = null;
  let drawW = STAGE;
  let drawH = STAGE;

  let x = 0;
  let y = 0;
  let z = 1;
  let r = 0;
  let down = false;
  let sx = 0;
  let sy = 0;
  let ox = 0;
  let oy = 0;
  let saving = false;

  hostEl.innerHTML = `
    <div class="ux u069">
      <div class="u069-top">
        <span class="u069-me ${isAdmin ? 'is-admin' : ''}" aria-hidden="true"></span>
        <span class="u069-head-text">
          <b>Căn chỉnh ảnh đại diện</b>
          <small>Kéo ảnh và phóng to để vừa vòng tròn</small>
        </span>
        ${
          onCancel
            ? `<button type="button" class="u069-close" aria-label="Đóng khung cắt ảnh" title="Quay lại">✕</button>`
            : ''
        }
      </div>

      <div
        class="u069-crop"
        tabindex="0"
        role="application"
        aria-roledescription="photo cropper"
        aria-label="Căn chỉnh vị trí ảnh đại diện. Kéo bằng chuột hoặc dùng phím mũi tên, phóng to bằng phím cộng và trừ"
      >
        <div class="u069-img" aria-hidden="true"></div>
        <span class="u069-shade" aria-hidden="true"></span>
        <span class="u069-grid" aria-hidden="true"></span>
        <span class="u069-ring" aria-hidden="true"></span>
        <span class="u069-up" aria-hidden="true">Đang xử lý ảnh…</span>
      </div>

      <div class="u069-tools">
        <svg viewBox="0 0 18 18" aria-hidden="true"><circle cx="8" cy="8" r="5"/><path d="M12 12l4 4M6 8h4"/></svg>
        <input class="u069-z" type="range" min="100" max="300" value="100" aria-label="Phóng to ảnh">
        <svg viewBox="0 0 18 18" aria-hidden="true"><circle cx="8" cy="8" r="5"/><path d="M12 12l4 4M6 8h4M8 6v4"/></svg>
        <button class="u069-rot" type="button" aria-label="Xoay 90 độ" title="Xoay 90°">
          <svg viewBox="0 0 18 18"><path d="M14.5 9A5.5 5.5 0 1 1 9 3.5h3M10.5 1.5L12.5 3.5 10.5 5.5"/></svg>
        </button>
      </div>

      <div class="u069-acts">
        <button class="u069-b ghost" type="button">Chọn ảnh khác</button>
        <button class="u069-b main" type="button">Xác nhận cắt ảnh</button>
      </div>
      <input class="u069-file-inp" type="file" accept="image/*" hidden />
    </div>
  `;

  const root = hostEl.querySelector('.u069');
  const crop = root.querySelector('.u069-crop');
  const imgBox = crop.querySelector('.u069-img');
  const me = root.querySelector('.u069-me');
  const zoom = root.querySelector('.u069-z');
  const rot = root.querySelector('.u069-rot');
  const other = root.querySelector('.u069-b.ghost');
  const save = root.querySelector('.u069-b.main');
  const closeBtn = root.querySelector('.u069-close');
  const fileInp = root.querySelector('.u069-file-inp');

  function renderInitialMe() {
    if (initialPreviewUrl) {
      me.innerHTML = `<img class="u069-me-static" src="${escapeHtmlBasic(initialPreviewUrl)}" alt="" />`;
    } else {
      me.textContent = initials;
    }
  }
  renderInitialMe();

  function clamp() {
    const quarterTurns = ((Math.round(r / 90) % 2) + 2) % 2;
    const effW = (quarterTurns === 0 ? drawW : drawH) * z;
    const effH = (quarterTurns === 0 ? drawH : drawW) * z;
    const maxX = Math.max(0, (effW - HOLE) / 2);
    const maxY = Math.max(0, (effH - HOLE) / 2);
    x = Math.max(-maxX, Math.min(maxX, x));
    y = Math.max(-maxY, Math.min(maxY, y));
  }

  function tf() {
    return `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${r}deg) scale(${z.toFixed(3)})`;
  }

  function buildPhotoMarkup(src) {
    const left = ((STAGE - drawW) / 2).toFixed(2);
    const top = ((STAGE - drawH) / 2).toFixed(2);
    return `<img class="u069-photo" draggable="false" src="${escapeHtmlBasic(src)}" style="width:${drawW.toFixed(2)}px;height:${drawH.toFixed(2)}px;left:${left}px;top:${top}px;" alt="" />`;
  }

  function paint() {
    clamp();
    imgBox.style.transform = tf();
    zoom.value = String(Math.round(z * 100));
    zoom.style.setProperty('--f', `${(((z - 1) / 2) * 100).toFixed(1)}%`);
    zoom.setAttribute('aria-valuetext', `${Math.round(z * 100)}%`);
  }

  async function loadSource(srcOrFile, animateEntrance = false) {
    if (!srcOrFile) return;
    crop.classList.add('busy');
    let nextObjectUrl = null;
    try {
      let srcUrl = '';
      if (srcOrFile instanceof File || srcOrFile instanceof Blob) {
        if (srcOrFile.type && !srcOrFile.type.startsWith('image/')) {
          throw new Error('Vui lòng chọn tệp hình ảnh (JPG, PNG, WebP...).');
        }
        nextObjectUrl = URL.createObjectURL(srcOrFile);
        srcUrl = nextObjectUrl;
      } else {
        srcUrl = String(srcOrFile);
      }

      const img = await loadImageElement(srcUrl);
      if (!root.isConnected) {
        if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl);
        return;
      }

      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = nextObjectUrl;
      currentImgSrc = srcUrl;
      loadedImg = img;

      const natW = img.naturalWidth || img.width || STAGE;
      const natH = img.naturalHeight || img.height || STAGE;
      const baseScale = Math.max(STAGE / natW, STAGE / natH);
      drawW = natW * baseScale;
      drawH = natH * baseScale;

      x = 0;
      y = 0;
      z = 1;
      r = 0;

      imgBox.innerHTML = buildPhotoMarkup(currentImgSrc);
      paint();
      crop.classList.remove('busy');

      if (animateEntrance && !rm && imgBox.animate) {
        imgBox.animate(
          [
            { opacity: 0, transform: `${tf()} scale(.9)` },
            { opacity: 1, transform: tf() },
          ],
          { duration: 420, easing: 'cubic-bezier(.34,1.4,.64,1)' }
        );
      }
    } catch (err) {
      if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl);
      crop.classList.remove('busy');
      onError?.(err);
    }
  }

  function exportCroppedDataUrl(outSize = 160) {
    if (!loadedImg) return '';
    const canvas = document.createElement('canvas');
    canvas.width = outSize;
    canvas.height = outSize;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outSize, outSize);
    ctx.save();
    ctx.translate(outSize / 2, outSize / 2);
    ctx.scale(outSize / HOLE, outSize / HOLE);
    ctx.translate(x, y);
    ctx.rotate((r * Math.PI) / 180);
    ctx.scale(z, z);
    ctx.drawImage(loadedImg, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
    let dataUrl = canvas.toDataURL('image/jpeg', 0.74);
    if (dataUrl.length > 42000) {
      dataUrl = canvas.toDataURL('image/jpeg', 0.56);
    }
    return dataUrl;
  }

  // Pointer drag / pan
  crop.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !loadedImg || saving) return;
    down = true;
    sx = e.clientX;
    sy = e.clientY;
    ox = x;
    oy = y;
    crop.setPointerCapture?.(e.pointerId);
    crop.classList.add('drag');
  });

  crop.addEventListener('pointermove', (e) => {
    if (!down) return;
    const rect = crop.getBoundingClientRect();
    const k = rect.width > 0 ? crop.offsetWidth / rect.width : 1;
    x = ox + (e.clientX - sx) * k;
    y = oy + (e.clientY - sy) * k;
    paint();
  });

  const endDrag = () => {
    down = false;
    crop.classList.remove('drag');
  };
  crop.addEventListener('pointerup', endDrag);
  crop.addEventListener('pointercancel', endDrag);

  // Wheel zoom
  let wheelTimer = 0;
  crop.addEventListener(
    'wheel',
    (e) => {
      if (!loadedImg || saving) return;
      e.preventDefault();
      crop.classList.add('now');
      z = Math.max(1, Math.min(3, z * (e.deltaY < 0 ? 1.06 : 0.94)));
      paint();
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => crop.classList.remove('now'), 120);
    },
    { passive: false }
  );

  // Keyboard pan + zoom
  crop.addEventListener('keydown', (e) => {
    if (!loadedImg || saving) return;
    const k = e.key;
    const step = e.shiftKey ? 20 : 6;
    if (k === 'ArrowLeft') x += step;
    else if (k === 'ArrowRight') x -= step;
    else if (k === 'ArrowUp') y += step;
    else if (k === 'ArrowDown') y -= step;
    else if (k === '+' || k === '=') z = Math.min(3, z + 0.1);
    else if (k === '-') z = Math.max(1, z - 0.1);
    else return;
    e.preventDefault();
    paint();
  });

  // Slider zoom
  zoom.addEventListener('input', () => {
    if (!loadedImg || saving) return;
    crop.classList.add('now');
    z = Number(zoom.value) / 100;
    paint();
  });
  zoom.addEventListener('change', () => crop.classList.remove('now'));

  // Rotate 90°
  rot.addEventListener('click', () => {
    if (!loadedImg || saving) return;
    r += 90;
    paint();
  });

  // Pick another photo
  other.addEventListener('click', () => {
    if (saving) return;
    fileInp.value = '';
    fileInp.click();
  });

  fileInp.addEventListener('change', () => {
    const f = fileInp.files?.[0];
    if (f) loadSource(f, true);
  });

  closeBtn?.addEventListener('click', () => {
    if (saving) return;
    cleanup();
    onCancel?.();
  });

  // Save with Lucian #069 flying circle animation -> 160x160 JPEG export
  save.addEventListener('click', () => {
    if (!loadedImg || saving) return;
    saving = true;
    const dataUrl = exportCroppedDataUrl(160);
    const snapshotTf = tf();
    const photoHtml = buildPhotoMarkup(currentImgSrc);

    const finishApply = () => {
      if (!root.isConnected) return;
      me.innerHTML = `<div class="u069-img">${photoHtml}</div>`;
      me.firstChild.style.transform = `scale(${ME_SIZE / HOLE}) ${snapshotTf}`;
      if (!rm && me.animate) {
        me.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1)' }], {
          duration: 420,
          easing: 'cubic-bezier(.34,1.5,.64,1)',
        });
      }
      save.classList.add('ok');
      save.textContent = 'Đã cắt ✓';
      setTimeout(() => {
        saving = false;
        if (root.isConnected) {
          save.classList.remove('ok');
          save.textContent = 'Xác nhận cắt ảnh';
        }
        onApply?.(dataUrl);
      }, rm ? 120 : 620);
    };

    if (rm) {
      finishApply();
      return;
    }

    const fly = document.createElement('div');
    fly.className = 'u069-fly';
    fly.innerHTML = `<div class="u069-img">${photoHtml}</div>`;
    fly.firstChild.style.transform = snapshotTf;
    fly.style.left = '0';
    fly.style.top = '0';
    fly.style.transformOrigin = '0 0';
    root.appendChild(fly);

    const rootRect = root.getBoundingClientRect();
    const cropRect = crop.getBoundingClientRect();
    const meRect = me.getBoundingClientRect();
    const scaleFactor = cropRect.width > 0 ? cropRect.width / STAGE : 1;
    const fx = cropRect.left - rootRect.left + 20 * scaleFactor;
    const fy = cropRect.top - rootRect.top + 20 * scaleFactor;
    const tx = meRect.left - rootRect.left;
    const ty = meRect.top - rootRect.top;
    const k = meRect.width / HOLE;

    const anim = fly.animate(
      [
        { transform: `translate(${fx}px,${fy}px) scale(${scaleFactor})` },
        { transform: `translate(${tx}px,${ty}px) scale(${k})` },
      ],
      { duration: 600, easing: 'cubic-bezier(.6,0,.2,1)', fill: 'forwards' }
    );
    anim.onfinish = () => {
      fly.remove();
      finishApply();
    };
  });

  function cleanup() {
    clearTimeout(wheelTimer);
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
  }

  if (source) {
    loadSource(source, false);
  }

  return {
    loadSource,
    cleanup,
    exportCroppedDataUrl,
  };
}
