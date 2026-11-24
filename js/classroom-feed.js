import { api } from './api.js?v=20261124z2';
import { escapeHtml, escapeAttr, formatDateTimeVN } from './exam-engine.js?v=20261123d';
import { loadPdfJs } from './pdf-reader.js?v=20261123d';
import { mountAnimatedDropzone } from './ux-dropzone.js?v=20261124z2';

/**
 * Extract 11-char YouTube video ID from any URL or full <iframe> embed code.
 */
export function extractYouTubeId(input) {
  const s = String(input || '').trim();
  if (!s) return null;

  // If user pasted full <iframe ... src="..."></iframe>, grab src first
  const iframeSrc = s.match(/src=["']([^"']+)["']/i);
  const candidate = iframeSrc ? iframeSrc[1] : s;

  const patterns = [
    /(?:youtube\.com|youtube-nocookie\.com)\/embed\/([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com)\/watch\?(?:[^#]*&)?v=([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com)\/shorts\/([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com)\/live\/([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const re of patterns) {
    const m = candidate.match(re);
    if (m) return m[1];
  }
  return null;
}

function formatFileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1).replace('.', ',')} KB`;
  return `${(n / (1024 * 1024)).toFixed(2).replace('.', ',')} MB`;
}

function getFileTypeMeta(fileName = '', mimeType = '') {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const mime = String(mimeType || '').toLowerCase();
  if (ext === 'pdf' || mime === 'application/pdf') {
    return { kind: 'pdf', label: 'PDF', cls: 'file-badge-pdf' };
  }
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(ext) || mime.startsWith('image/')) {
    return { kind: 'image', label: 'IMG', cls: 'file-badge-img' };
  }
  if (['mp4', 'webm', 'mov', 'm4v', 'ogv', 'mkv', 'avi'].includes(ext) || mime.startsWith('video/')) {
    return { kind: 'video', label: 'VIDEO', cls: 'file-badge-vid' };
  }
  if (['mp3', 'wav', 'm4a', 'ogg', 'aac', 'flac'].includes(ext) || mime.startsWith('audio/')) {
    return { kind: 'audio', label: 'AUDIO', cls: 'file-badge-aud' };
  }
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) {
    return { kind: 'doc', label: 'WORD', cls: 'file-badge-doc' };
  }
  if (['ppt', 'pptx', 'odp'].includes(ext)) {
    return { kind: 'doc', label: 'PPT', cls: 'file-badge-ppt' };
  }
  if (['xls', 'xlsx', 'ods', 'csv'].includes(ext)) {
    return { kind: 'doc', label: 'EXCEL', cls: 'file-badge-xls' };
  }
  if (['zip', 'rar', '7z'].includes(ext)) {
    return { kind: 'doc', label: ext.toUpperCase(), cls: 'file-badge-other' };
  }
  if (['html', 'htm', 'txt'].includes(ext)) {
    return { kind: 'doc', label: ext.toUpperCase().slice(0, 4), cls: 'file-badge-html' };
  }
  return { kind: 'doc', label: ext ? ext.toUpperCase().slice(0, 4) : 'FILE', cls: 'file-badge-other' };
}

function formatPostBody(text) {
  if (!text) return '';
  const escaped = escapeHtml(text);
  // Linkify bare URLs cleanly while preserving line breaks
  const withLinks = escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" class="feed-inline-link">$1</a>'
  );
  return withLinks.replace(/\n/g, '<br/>');
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || '');
      const idx = res.indexOf(',');
      resolve(idx >= 0 ? res.slice(idx + 1) : res);
    };
    reader.onerror = () => reject(new Error(`Không thể đọc tệp ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function computeUserInitials(name = '') {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0] || 'U').slice(0, 2).toUpperCase();
}

function renderPostLikeFooter(post, isAdmin) {
  const likeCount = Math.max(0, Number(post.likeCount) || 0);
  const likedByMe = Boolean(post.likedByMe);
  const safeGid = `u022-g-${String(post.id || 'p').replace(/[^a-zA-Z0-9_-]/g, '')}`;

  return `
    <div class="feed-post-footer">
      <div
        class="ux u022 u022-post ${likedByMe ? 'is-on' : ''}"
        data-like-widget="${escapeAttr(post.id)}"
        data-like-count="${likeCount}"
      >
        <button
          class="u022-btn"
          type="button"
          data-like-btn="${escapeAttr(post.id)}"
          aria-pressed="${likedByMe ? 'true' : 'false'}"
          aria-label="${likedByMe ? 'Bỏ thả tim bài viết' : 'Thả tim bài viết'}"
          title="${likedByMe ? 'Bỏ thả tim' : 'Thả tim bài viết'}"
        >
          <span class="u022-ring" aria-hidden="true"></span>
          <span class="u022-dot" style="--a:0deg;--c:#FF4D6D;--c2:#FFB26B" aria-hidden="true"><i></i><i></i></span>
          <span class="u022-dot" style="--a:51deg;--c:#8B6CFF;--c2:#FF7A93" aria-hidden="true"><i></i><i></i></span>
          <span class="u022-dot" style="--a:103deg;--c:#FFB547;--c2:#22C3A6" aria-hidden="true"><i></i><i></i></span>
          <span class="u022-dot" style="--a:154deg;--c:#FF4D6D;--c2:#8B6CFF" aria-hidden="true"><i></i><i></i></span>
          <span class="u022-dot" style="--a:206deg;--c:#22C3A6;--c2:#FFB547" aria-hidden="true"><i></i><i></i></span>
          <span class="u022-dot" style="--a:257deg;--c:#FF7A93;--c2:#3D8BFF" aria-hidden="true"><i></i><i></i></span>
          <span class="u022-dot" style="--a:309deg;--c:#3D8BFF;--c2:#FF4D6D" aria-hidden="true"><i></i><i></i></span>
          <span class="u022-heart" aria-hidden="true">
            <svg viewBox="0 0 52 52">
              <defs>
                <linearGradient id="${safeGid}" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stop-color="#FF7A93"/>
                  <stop offset="1" stop-color="#F0264D"/>
                </linearGradient>
              </defs>
              <path
                class="u022-f"
                style="fill:url(#${safeGid})"
                d="M26 45S5 33 5 18.5C5 11.6 10.4 7 16.4 7c4.3 0 7.6 2.3 9.6 5.6C28 9.3 31.3 7 35.6 7 41.6 7 47 11.6 47 18.5 47 33 26 45 26 45z"
              />
              <path
                class="u022-o"
                style="${likedByMe ? 'stroke:transparent' : ''}"
                d="M26 45S5 33 5 18.5C5 11.6 10.4 7 16.4 7c4.3 0 7.6 2.3 9.6 5.6C28 9.3 31.3 7 35.6 7 41.6 7 47 11.6 47 18.5 47 33 26 45 26 45z"
              />
            </svg>
          </span>
        </button>
        ${
          isAdmin
            ? `
              <button
                type="button"
                class="u022-meta u022-likers-btn ${likeCount > 0 ? 'has-likers' : ''}"
                data-view-likers="${escapeAttr(post.id)}"
                title="Xem ai đã thả tim"
              >
                <span class="u022-roll" aria-live="polite" data-ci="0"><span>${likeCount}</span><span></span></span>
              </button>
            `
            : `
              <span class="u022-meta">
                <span class="u022-roll" aria-live="polite" data-ci="0"><span>${likeCount}</span><span></span></span>
              </span>
            `
        }
      </div>
    </div>
  `;
}

/**
 * Render a single Classroom Newsfeed Post Card.
 * Automatically groups heterogeneous attachments (YouTube videos, images, PDFs/docs, links)
 * into clean, harmonious visual zones regardless of upload order!
 */
export function renderFeedPostCard(post, { isAdmin = false } = {}) {
  const atts = Array.isArray(post.attachments) ? post.attachments : [];

  const ytVideos = atts.filter((a) => a.type === 'youtube' && a.videoId);
  const uploadedVideos = atts.filter(
    (a) => a.type === 'file' && getFileTypeMeta(a.fileName, a.mimeType).kind === 'video'
  );
  const allVideoCount = ytVideos.length + uploadedVideos.length;
  const images = atts.filter(
    (a) => a.type === 'image' || (a.type === 'file' && getFileTypeMeta(a.fileName, a.mimeType).kind === 'image')
  );
  const audios = atts.filter(
    (a) => a.type === 'file' && getFileTypeMeta(a.fileName, a.mimeType).kind === 'audio'
  );
  const docs = atts.filter((a) => {
    if (a.type !== 'file') return false;
    const k = getFileTypeMeta(a.fileName, a.mimeType).kind;
    return k !== 'image' && k !== 'video' && k !== 'audio';
  });
  const links = atts.filter((a) => a.type === 'link' && a.url);

  const targetBadge = post.targetAll
    ? `<span class="badge badge-neutral">Tất cả lớp</span>`
    : (post.targetClasses || []).map((c) => `<span class="badge badge-p1">Lớp ${escapeHtml(c)}</span>`).join('');

  return `
    <article class="card feed-post-card ${post.pinned ? 'is-pinned' : ''}" data-post-id="${escapeAttr(post.id)}">
      <!-- Post Header -->
      <div class="feed-post-head">
        <div class="feed-author-wrap">
          <div class="feed-avatar" aria-hidden="true">TH</div>
          <div>
            <div class="feed-author-row">
              <strong class="feed-author-name">${escapeHtml(post.authorName || 'Lê Viết Hoàng')}</strong>
              ${post.pinned ? `<span class="badge badge-warning">Đã ghim</span>` : ''}
              ${targetBadge}
            </div>
            <div class="feed-post-time">${escapeHtml(formatDateTimeVN(post.createdAt))}</div>
          </div>
        </div>
        ${
          isAdmin
            ? `
              <div class="feed-admin-actions">
                <button type="button" class="btn btn-ghost btn-sm" data-pin-post="${post.id}" title="${post.pinned ? 'Bỏ ghim' : 'Ghim lên đầu'}">
                  ${post.pinned ? 'Bỏ ghim' : 'Ghim'}
                </button>
                <button type="button" class="btn btn-secondary btn-sm" data-edit-post="${post.id}">Sửa</button>
                <button type="button" class="btn btn-danger-outline btn-sm" data-del-post="${post.id}">Xóa</button>
              </div>
            `
            : ''
        }
      </div>

      <!-- Post Title & Body -->
      ${post.title ? `<h3 class="feed-post-title">${escapeHtml(post.title)}</h3>` : ''}
      ${post.content ? `<div class="feed-post-body">${formatPostBody(post.content)}</div>` : ''}

      <!-- ZONE A: Videos (YouTube Embeds + Uploaded Video Files) -->
      ${
        allVideoCount > 0
          ? `
            <div class="feed-media-zone feed-video-grid ${allVideoCount === 1 ? 'is-single' : 'is-multi'}">
              ${ytVideos
                .map(
                  (v) => `
                <div class="feed-video-card">
                  <div class="feed-video-frame">
                    <iframe
                      src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.videoId)}"
                      title="${escapeAttr(v.title || 'Video bài giảng')}"
                      frameborder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowfullscreen
                      loading="lazy"
                    ></iframe>
                  </div>
                  ${v.title ? `<div class="feed-video-caption">${escapeHtml(v.title)}</div>` : ''}
                </div>
              `
                )
                .join('')}
              ${uploadedVideos
                .map(
                  (v) => `
                <div class="feed-video-card">
                  <div class="feed-video-frame">
                    <video controls playsinline preload="metadata" src="${escapeAttr(v.url)}"></video>
                  </div>
                  <div class="feed-video-caption feed-video-caption-row">
                    <span>${escapeHtml(v.title || v.fileName || 'Video đính kèm')}</span>
                    <a class="btn btn-secondary btn-sm" href="${escapeAttr(v.url)}?download=1" download="${escapeAttr(v.fileName || 'video.mp4')}">Tải về</a>
                  </div>
                </div>
              `
                )
                .join('')}
            </div>
          `
          : ''
      }

      <!-- ZONE B: Adaptive Photo Gallery (1, 2, or 3+ photos) -->
      ${
        images.length > 0
          ? `
            <div class="feed-media-zone feed-photo-grid cols-${Math.min(3, images.length)}">
              ${images
                .map(
                  (img) => `
                <button type="button" class="feed-photo-item" data-lightbox-src="${escapeAttr(img.url)}" data-lightbox-title="${escapeAttr(img.title || img.fileName || '')}">
                  <img src="${escapeAttr(img.url)}" alt="${escapeAttr(img.title || img.fileName || 'Hình ảnh đính kèm')}" loading="lazy" />
                </button>
              `
                )
                .join('')}
            </div>
          `
          : ''
      }

      <!-- ZONE B2: Audio Files -->
      ${
        audios.length > 0
          ? `
            <div class="feed-media-zone">
              <div class="feed-audio-list">
                ${audios
                  .map(
                    (au) => `
                  <div class="feed-audio-card">
                    <div class="feed-audio-head">
                      <span class="file-type-badge file-badge-aud">AUDIO</span>
                      <div class="feed-doc-info">
                        <div class="feed-doc-name">${escapeHtml(au.title || au.fileName || 'Tệp âm thanh')}</div>
                        ${au.size ? `<div class="feed-doc-meta">${formatFileSize(au.size)}</div>` : ''}
                      </div>
                      <a class="btn btn-secondary btn-sm" href="${escapeAttr(au.url)}?download=1" download="${escapeAttr(au.fileName || 'audio')}">Tải về</a>
                    </div>
                    <audio controls preload="metadata" src="${escapeAttr(au.url)}" style="width:100%; height:36px;"></audio>
                  </div>
                `
                  )
                  .join('')}
              </div>
            </div>
          `
          : ''
      }

      <!-- ZONE C: Documents & PDF Handouts -->
      ${
        docs.length > 0
          ? `
            <div class="feed-media-zone">
              <div class="feed-zone-label">Tài liệu đính kèm (${docs.length})</div>
              <div class="feed-doc-grid ${docs.length === 1 ? 'is-single' : ''}">
                ${docs
                  .map((d) => {
                    const meta = getFileTypeMeta(d.fileName, d.mimeType);
                    const isPdf = meta.kind === 'pdf';
                    const displayName = d.title || d.fileName || 'Tài liệu';
                    return `
                      <div class="feed-doc-card">
                        <div class="file-type-badge ${meta.cls}">${meta.label}</div>
                        <div class="feed-doc-info">
                          <div class="feed-doc-name" title="${escapeAttr(displayName)}">${escapeHtml(displayName)}</div>
                          <div class="feed-doc-meta">
                            ${d.size ? formatFileSize(d.size) : meta.label}
                          </div>
                        </div>
                        <div class="feed-doc-actions">
                          ${
                            isPdf
                              ? `<button type="button" class="btn btn-primary btn-sm" data-view-pdf="${escapeAttr(d.url)}" data-pdf-title="${escapeAttr(displayName)}">Xem PDF</button>`
                              : ''
                          }
                          <a class="btn btn-secondary btn-sm" href="${escapeAttr(d.url)}?download=1" download="${escapeAttr(d.fileName || 'document')}">
                            Tải về
                          </a>
                        </div>
                      </div>
                    `;
                  })
                  .join('')}
              </div>
            </div>
          `
          : ''
      }

      <!-- ZONE D: External Reference Links -->
      ${
        links.length > 0
          ? `
            <div class="feed-media-zone">
              <div class="feed-link-list">
                ${links
                  .map(
                    (lk) => `
                  <a class="feed-link-card" href="${escapeAttr(lk.url)}" target="_blank" rel="noopener noreferrer">
                    <div class="feed-link-icon" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                      </svg>
                    </div>
                    <div class="feed-link-info">
                      <div class="feed-link-title">${escapeHtml(lk.title || extractDomain(lk.url))}</div>
                      <div class="feed-link-url">${escapeHtml(lk.url)}</div>
                    </div>
                    <span class="feed-link-arrow">↗</span>
                  </a>
                `
                  )
                  .join('')}
              </div>
            </div>
          `
          : ''
      }
      <!-- ZONE E: Heart Like Footer (#022) -->
      ${renderPostLikeFooter(post, isAdmin)}
    </article>
  `;
}

export function renderFeedList({ posts = [], isAdmin = false, emptyTitle = 'Chưa có bài viết nào', emptyText = '' } = {}) {
  if (!posts.length) {
    return `
      <div class="card lab-empty-state">
        <div class="lab-empty-icon">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
          </svg>
        </div>
        <h3>${escapeHtml(emptyTitle)}</h3>
        ${emptyText ? `<p>${emptyText}</p>` : ''}
      </div>
    `;
  }
  return `<div class="feed-stream">${posts.map((p) => renderFeedPostCard(p, { isAdmin })).join('')}</div>`;
}

export function bindFeedEvents(container, { uiHelpers, posts = [], isAdmin = false, onEdit, onDelete, onTogglePin } = {}) {
  const { openModal, closeModal, showToast } = uiHelpers;
  const reducedMotion = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function rollCounterTo(rollEl, nextVal, up) {
    if (!rollEl || rollEl.children.length < 2) return;
    const ci = Number(rollEl.dataset.ci || '0') === 1 ? 1 : 0;
    const cur = rollEl.children[ci];
    const nxt = rollEl.children[1 - ci];
    if (cur.textContent === String(nextVal)) return;
    nxt.style.transition = 'none';
    nxt.textContent = String(nextVal);
    nxt.style.transform = `translateY(${up ? 100 : -100}%)`;
    nxt.style.opacity = '0';
    void nxt.offsetWidth;
    nxt.style.transition = '';
    nxt.style.transform = 'none';
    nxt.style.opacity = '1';
    cur.style.transform = `translateY(${up ? -100 : 100}%)`;
    cur.style.opacity = '0';
    rollEl.dataset.ci = String(1 - ci);
  }

  function syncAdminLikersButton(widget, count) {
    const likersBtn = widget.querySelector('[data-view-likers]');
    if (!likersBtn) return;
    likersBtn.classList.toggle('has-likers', count > 0);
    const chip = likersBtn.querySelector('.u022-who-chip');
    if (chip) chip.classList.toggle('hidden', count <= 0);
  }

  // Heart Like Button (#022)
  container.querySelectorAll('[data-like-widget]').forEach((widget) => {
    const postId = widget.dataset.likeWidget;
    const btn = widget.querySelector('[data-like-btn]');
    const roll = widget.querySelector('.u022-roll');
    const outline = widget.querySelector('.u022-o');
    if (!btn || !roll) return;
    let popTimer = 0;

    btn.addEventListener('click', async () => {
      if (widget.dataset.busy === '1') return;
      widget.dataset.busy = '1';

      const prevOn = widget.classList.contains('is-on');
      const prevCount = Math.max(0, Number(widget.dataset.likeCount) || 0);
      const nextOn = !prevOn;
      const nextCount = Math.max(0, prevCount + (nextOn ? 1 : -1));

      // Instant optimistic Lucian #022 animation
      widget.classList.toggle('is-on', nextOn);
      widget.dataset.likeCount = String(nextCount);
      btn.setAttribute('aria-pressed', String(nextOn));
      btn.setAttribute('aria-label', nextOn ? 'Bỏ thả tim bài viết' : 'Thả tim bài viết');
      btn.setAttribute('title', nextOn ? 'Bỏ thả tim' : 'Thả tim bài viết');
      if (outline) outline.style.stroke = nextOn ? 'transparent' : '';
      rollCounterTo(roll, nextCount, nextOn);
      syncAdminLikersButton(widget, nextCount);

      widget.classList.remove('is-pop');
      clearTimeout(popTimer);
      if (nextOn && !reducedMotion) {
        void widget.offsetWidth;
        widget.classList.add('is-pop');
        popTimer = setTimeout(() => widget.classList.remove('is-pop'), 900);
      }

      try {
        const res = await api.togglePostLike(postId);
        const srv = res?.post;
        if (srv) {
          const target = Array.isArray(posts) ? posts.find((p) => p.id === postId) : null;
          if (target) Object.assign(target, srv);

          const finalOn = Boolean(srv.likedByMe);
          const finalCount = Math.max(0, Number(srv.likeCount) || 0);
          widget.classList.toggle('is-on', finalOn);
          widget.dataset.likeCount = String(finalCount);
          btn.setAttribute('aria-pressed', String(finalOn));
          btn.setAttribute('aria-label', finalOn ? 'Bỏ thả tim bài viết' : 'Thả tim bài viết');
          btn.setAttribute('title', finalOn ? 'Bỏ thả tim' : 'Thả tim bài viết');
          if (outline) outline.style.stroke = finalOn ? 'transparent' : '';
          if (finalCount !== nextCount) {
            rollCounterTo(roll, finalCount, finalCount > nextCount);
          }
          syncAdminLikersButton(widget, finalCount);
        }
      } catch (err) {
        // Revert optimistic state on error
        widget.classList.toggle('is-on', prevOn);
        widget.dataset.likeCount = String(prevCount);
        btn.setAttribute('aria-pressed', String(prevOn));
        btn.setAttribute('aria-label', prevOn ? 'Bỏ thả tim bài viết' : 'Thả tim bài viết');
        btn.setAttribute('title', prevOn ? 'Bỏ thả tim' : 'Thả tim bài viết');
        if (outline) outline.style.stroke = prevOn ? 'transparent' : '';
        rollCounterTo(roll, prevCount, prevCount > nextCount);
        syncAdminLikersButton(widget, prevCount);
        showToast?.(err?.message || 'Không thể cập nhật lượt thả tim.', 'error');
      } finally {
        widget.dataset.busy = '0';
      }
    });
  });

  // Admin-only Likers Modal ("Những người đã thả tim")
  if (isAdmin) {
    container.querySelectorAll('[data-view-likers]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const postId = btn.dataset.viewLikers;
        const post = Array.isArray(posts) ? posts.find((p) => p.id === postId) : null;
        const likers = Array.isArray(post?.likedBy) ? post.likedBy : [];

        const bodyHtml =
          likers.length === 0
            ? `<div class="feed-likers-empty">Chưa có ai thả tim bài viết này.</div>`
            : `
              <div class="feed-likers-list">
                ${likers
                  .map((u) => {
                    const isAdm = u.role === 'admin';
                    const roleBadge = isAdm
                      ? `<span class="badge badge-p1">Giáo viên</span>`
                      : u.className
                        ? `<span class="badge badge-neutral">Lớp ${escapeHtml(u.className)}</span>`
                        : `<span class="badge badge-neutral">Học sinh</span>`;
                    const avSrc =
                      u.avatarUrl && u.avatarUrl.startsWith('/assets/avatars/') && !u.avatarUrl.includes('?')
                        ? `${u.avatarUrl}?v=20261124f`
                        : u.avatarUrl;
                    const avHtml = avSrc
                      ? `<img src="${escapeAttr(avSrc)}" alt="${escapeAttr(u.fullName)}" />`
                      : `<span>${escapeHtml(computeUserInitials(u.fullName || u.username))}</span>`;
                    return `
                      <div class="feed-liker-row">
                        <div class="feed-liker-av ${isAdm ? 'is-admin' : ''}">${avHtml}</div>
                        <div class="feed-liker-info">
                          <div class="feed-liker-name-row">
                            <strong>${escapeHtml(u.fullName || u.username)}</strong>
                            ${roleBadge}
                          </div>
                          <div class="feed-liker-sub">
                            @${escapeHtml(u.username)}${u.at ? ` · ${escapeHtml(formatDateTimeVN(u.at))}` : ''}
                          </div>
                        </div>
                        <span class="feed-liker-heart" aria-hidden="true">❤</span>
                      </div>
                    `;
                  })
                  .join('')}
              </div>
            `;

        openModal({
          title: `Những người đã thả tim (${likers.length})`,
          bodyHtml,
          footerHtml: `<button class="btn btn-primary" id="mCloseLikers">Đóng</button>`,
          onMount: (m) => m.querySelector('#mCloseLikers')?.addEventListener('click', closeModal),
        });
      });
    });
  }

  // Built-in fit-to-frame PDF.js viewer popup modal (crisp on iPhone/Android/Desktop + open in new tab)
  container.querySelectorAll('[data-view-pdf]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const url = btn.dataset.viewPdf;
      const title = btn.dataset.pdfTitle || 'Tài liệu PDF';
      openModal({
        title,
        wide: true,
        bodyHtml: `
          <div class="pdf-viewer-shell">
            <div class="pdf-viewer-bar">
              <span class="pdf-viewer-status" id="pdfPageIndicator">Đang tải tài liệu...</span>
              <div class="pdf-viewer-zoom">
                <button type="button" class="btn btn-secondary btn-sm" id="pdfZoomOut" title="Thu nhỏ">−</button>
                <button type="button" class="btn btn-secondary btn-sm" id="pdfZoomFit" title="Vừa khít 1 trang">Vừa trang</button>
                <button type="button" class="btn btn-secondary btn-sm" id="pdfZoomIn" title="Phóng to">+</button>
              </div>
            </div>
            <div class="pdf-viewer-scroll" id="pdfViewerScroll">
              <div class="pdf-pages-stack" id="pdfPagesStack">
                <div class="pdf-viewer-loading">Đang dựng trang PDF vừa khít khung...</div>
              </div>
            </div>
          </div>
        `,
        footerHtml: `
          <a class="btn btn-secondary" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">Mở tab riêng ↗</a>
          <a class="btn btn-secondary" href="${escapeAttr(url)}?download=1" download>Tải về PDF</a>
          <button class="btn btn-primary" id="mClosePdfView">Đóng</button>
        `,
        onMount: async (m) => {
          let cancelled = false;
          let zoom = 1.0;
          let pageInfos = [];
          const scrollEl = m.querySelector('#pdfViewerScroll');
          const stackEl = m.querySelector('#pdfPagesStack');
          const statusEl = m.querySelector('#pdfPageIndicator');

          const cleanupAndClose = () => {
            cancelled = true;
            closeModal();
          };
          m.querySelector('#mClosePdfView').addEventListener('click', cleanupAndClose);

          function applyZoom() {
            const innerW = Math.max(220, scrollEl.clientWidth - 20);
            const innerH = Math.max(260, scrollEl.clientHeight - 38);
            pageInfos.forEach(({ canvas, baseW, baseH }) => {
              const fitScale = Math.min(innerW / baseW, innerH / baseH);
              const dispW = Math.round(baseW * fitScale * zoom);
              const dispH = Math.round(baseH * fitScale * zoom);
              canvas.style.width = `${dispW}px`;
              canvas.style.height = `${dispH}px`;
            });
            const fitBtn = m.querySelector('#pdfZoomFit');
            if (fitBtn) {
              fitBtn.textContent = zoom === 1 ? 'Vừa trang' : `${Math.round(zoom * 100)}%`;
            }
          }

          m.querySelector('#pdfZoomOut')?.addEventListener('click', () => {
            zoom = Math.max(0.75, Math.round((zoom - 0.25) * 100) / 100);
            applyZoom();
          });
          m.querySelector('#pdfZoomFit')?.addEventListener('click', () => {
            zoom = 1.0;
            applyZoom();
            scrollEl.scrollLeft = 0;
          });
          m.querySelector('#pdfZoomIn')?.addEventListener('click', () => {
            zoom = Math.min(2.25, Math.round((zoom + 0.25) * 100) / 100);
            applyZoom();
          });

          scrollEl.addEventListener('scroll', () => {
            if (!pageInfos.length) return;
            const mid = scrollEl.scrollTop + scrollEl.clientHeight * 0.35;
            let cur = 1;
            for (const info of pageInfos) {
              if (info.wrap.offsetTop <= mid) cur = info.pageNum;
            }
            if (statusEl) statusEl.textContent = `Trang ${cur} / ${pageInfos.length}`;
          });

          try {
            const [pdfjsLib, resp] = await Promise.all([loadPdfJs(), fetch(url)]);
            if (!resp.ok) throw new Error(`Không tải được tệp PDF (${resp.status})`);
            const buf = await resp.arrayBuffer();
            if (cancelled || !document.body.contains(stackEl)) return;

            const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
            if (cancelled || !document.body.contains(stackEl)) return;

            const totalPages = pdf.numPages;
            if (statusEl) statusEl.textContent = `Trang 1 / ${totalPages}`;
            stackEl.innerHTML = '';

            const innerW = Math.max(220, scrollEl.clientWidth - 20);
            const innerH = Math.max(260, scrollEl.clientHeight - 38);
            const dpr = Math.min(window.devicePixelRatio || 1, 2);

            for (let p = 1; p <= totalPages; p++) {
              if (cancelled || !document.body.contains(stackEl)) return;
              const page = await pdf.getPage(p);
              const baseVp = page.getViewport({ scale: 1 });
              const fitScale = Math.min(innerW / baseVp.width, innerH / baseVp.height);
              // Render at sharp resolution so zooming up to ~200% stays crisp on Retina/mobile
              const renderScale = Math.max(fitScale * dpr * 1.6, 1.6);
              const vp = page.getViewport({ scale: renderScale });

              const wrap = document.createElement('div');
              wrap.className = 'pdf-page-wrap';

              const canvas = document.createElement('canvas');
              canvas.className = 'pdf-page-canvas';
              canvas.width = Math.ceil(vp.width);
              canvas.height = Math.ceil(vp.height);
              canvas.style.width = `${Math.round(baseVp.width * fitScale * zoom)}px`;
              canvas.style.height = `${Math.round(baseVp.height * fitScale * zoom)}px`;

              const numTag = document.createElement('div');
              numTag.className = 'pdf-page-num';
              numTag.textContent = `Trang ${p} / ${totalPages}`;

              wrap.appendChild(canvas);
              wrap.appendChild(numTag);
              stackEl.appendChild(wrap);
              pageInfos.push({ pageNum: p, wrap, canvas, baseW: baseVp.width, baseH: baseVp.height });

              const ctx = canvas.getContext('2d');
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              await page.render({ canvasContext: ctx, viewport: vp }).promise;
            }
          } catch {
            if (cancelled || !document.body.contains(stackEl)) return;
            if (statusEl) statusEl.textContent = 'Trình xem mặc định';
            stackEl.innerHTML = `
              <iframe src="${escapeAttr(url)}#view=FitH" style="width:100%; height:62vh; border:none; background:#fff;" title="${escapeAttr(title)}"></iframe>
            `;
          }
        },
      });
    });
  });

  // Image lightbox popup
  container.querySelectorAll('[data-lightbox-src]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const src = btn.dataset.lightboxSrc;
      const title = btn.dataset.lightboxTitle || 'Xem hình ảnh';
      openModal({
        title,
        wide: true,
        bodyHtml: `<div style="text-align:center;"><img src="${escapeAttr(src)}" alt="${escapeAttr(title)}" style="max-width:100%; max-height:70vh; border-radius:10px;" /></div>`,
        footerHtml: `
          <a class="btn btn-secondary" href="${escapeAttr(src)}" target="_blank" rel="noopener noreferrer">Mở gốc ↗</a>
          <button class="btn btn-primary" id="mCloseLb">Đóng</button>
        `,
        onMount: (m) => m.querySelector('#mCloseLb').addEventListener('click', closeModal),
      });
    });
  });

  if (onTogglePin) {
    container.querySelectorAll('[data-pin-post]').forEach((btn) => {
      btn.addEventListener('click', () => onTogglePin(btn.dataset.pinPost));
    });
  }
  if (onEdit) {
    container.querySelectorAll('[data-edit-post]').forEach((btn) => {
      btn.addEventListener('click', () => onEdit(btn.dataset.editPost));
    });
  }
  if (onDelete) {
    container.querySelectorAll('[data-del-post]').forEach((btn) => {
      btn.addEventListener('click', () => onDelete(btn.dataset.delPost));
    });
  }
}

/**
 * Rich Post Composer Modal for Teacher (supports YouTube embed, PDF/Word/Image uploads, and External Links)
 */
export function openPostComposerModal({ existing = null, classes = [], uiHelpers, onSaved }) {
  const { showToast, openModal, closeModal } = uiHelpers;
  const attachments = existing ? structuredClone(existing.attachments || []) : [];
  const initTargetAll = existing ? Boolean(existing.targetAll) : true;
  const chosenClasses = new Set(existing?.targetClasses || []);
  let uploadingCount = 0;

  function renderAttachmentsList() {
    if (attachments.length === 0) {
      return `<div class="composer-att-empty">Chưa có tệp, video hoặc liên kết đính kèm nào.</div>`;
    }
    return attachments
      .map((att, idx) => {
        let badge = '';
        let label = '';
        let sub = '';
        if (att.type === 'youtube') {
          badge = `<span class="file-type-badge file-badge-yt">YT</span>`;
          label = att.title || `Video YouTube (${att.videoId})`;
          sub = `youtube.com/watch?v=${att.videoId}`;
        } else if (att.type === 'file') {
          const fm = getFileTypeMeta(att.fileName, att.mimeType);
          badge = `<span class="file-type-badge ${fm.cls}">${fm.label}</span>`;
          label = att.title || att.fileName;
          sub = att.size ? formatFileSize(att.size) : '';
        } else {
          badge = `<span class="file-type-badge file-badge-link">LINK</span>`;
          label = att.title || extractDomain(att.url);
          sub = att.url;
        }
        return `
          <div class="composer-att-item">
            ${badge}
            <div style="flex:1; min-width:0; display:flex; flex-direction:column; gap:3px;">
              <input
                type="text"
                class="input-control input-compact composer-att-title-inp"
                data-att-title-idx="${idx}"
                value="${escapeAttr(att.title || '')}"
                placeholder="${escapeAttr(label)}"
                title="Đặt tên hiển thị cho mục đính kèm"
              />
              ${sub ? `<div style="font-size:0.73rem; color:var(--text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding-left:2px;">${escapeHtml(sub)}</div>` : ''}
            </div>
            <button type="button" class="btn btn-ghost btn-sm" data-rm-att="${idx}" title="Gỡ bỏ">✕</button>
          </div>
        `;
      })
      .join('');
  }

  openModal({
    title: existing ? 'Chỉnh sửa bài viết lớp học' : 'Đăng bài giảng / tài liệu mới',
    wide: true,
    bodyHtml: `
      <div class="form-group">
        <label>Tiêu đề bài viết</label>
        <input id="postTitle" class="input-control" placeholder="VD: Bài giảng Khảo sát hàm số + Handout PDF" value="${escapeAttr(existing?.title || '')}" />
      </div>

      <div class="form-group">
        <label>Nội dung / Lời dặn học sinh (hỗ trợ công thức toán $...$)</label>
        <textarea id="postContent" class="input-control" rows="3" placeholder="Viết hướng dẫn xem video, làm bài tập handout...">${escapeHtml(existing?.content || '')}</textarea>
      </div>

      <!-- Attachment Tools -->
      <div class="composer-tools-box">
        <div class="composer-tools-head">
          <strong>Đính kèm tệp, video YouTube hoặc đường link</strong>
          <span style="font-size:0.76rem; color:var(--text-muted);">Tự động sắp xếp hiển thị gọn đẹp theo từng loại</span>
        </div>

        <!-- Animated Multi-File Upload Zone (Images, Video, Audio, PDF, Word, PPT, Excel, ZIP...) -->
        <div id="btnPickPostFiles"></div>

        <!-- Add YouTube -->
        <div class="composer-add-row" style="margin-top:10px;">
          <input id="inpYtUrl" class="input-control input-compact" placeholder="Dán link YouTube hoặc mã nhúng <iframe>..." style="flex:1.4;" />
          <input id="inpYtTitle" class="input-control input-compact" placeholder="Tên video (tùy chọn)" style="flex:1;" />
          <button type="button" class="btn btn-secondary btn-sm" id="btnAddYt">+ Video YouTube</button>
        </div>

        <!-- Add External Link -->
        <div class="composer-add-row" style="margin-top:8px;">
          <input id="inpLinkUrl" class="input-control input-compact" placeholder="Dán đường link web (https://...)" style="flex:1.4;" />
          <input id="inpLinkTitle" class="input-control input-compact" placeholder="Tên hiển thị (tùy chọn)" style="flex:1;" />
          <button type="button" class="btn btn-secondary btn-sm" id="btnAddLink">+ Đường link</button>
        </div>

        <div id="composerAttList" class="composer-att-list">
          ${renderAttachmentsList()}
        </div>
      </div>

      <!-- Target Audience & Pin -->
      <div style="display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:12px; margin-top:14px; padding-top:12px; border-top:1px solid var(--border);">
        <div style="display:flex; flex-wrap:wrap; align-items:center; gap:10px;">
          <label class="checkbox-pill" style="margin:0;">
            <input type="checkbox" id="postTargetAll" ${initTargetAll ? 'checked' : ''} />
            <span>Tất cả lớp</span>
          </label>
          <div id="postClassPicks" style="display:flex; gap:6px; flex-wrap:wrap; ${initTargetAll ? 'opacity:0.4; pointer-events:none;' : ''}">
            ${classes
              .map(
                (c) => `
              <label class="checkbox-pill" style="margin:0;">
                <input type="checkbox" class="post-cls-chk" value="${escapeAttr(c)}" ${chosenClasses.has(c) ? 'checked' : ''} />
                <span>Lớp ${escapeHtml(c)}</span>
              </label>
            `
              )
              .join('')}
          </div>
        </div>
        <label class="checkbox-pill" style="margin:0;">
          <input type="checkbox" id="postPinned" ${existing?.pinned ? 'checked' : ''} />
          <span>Ghim lên đầu</span>
        </label>
      </div>
    `,
    footerHtml: `
      <button class="btn btn-secondary" id="mCancelPost">Hủy</button>
      <button class="btn btn-primary" id="mSavePost">${existing ? 'Lưu bài viết' : 'Đăng bài ngay'}</button>
    `,
    onMount: (m) => {
      const attListEl = m.querySelector('#composerAttList');
      const saveBtn = m.querySelector('#mSavePost');

      function syncAttDom() {
        attListEl.innerHTML = renderAttachmentsList();
        attListEl.querySelectorAll('[data-att-title-idx]').forEach((inp) => {
          inp.addEventListener('input', () => {
            const i = Number(inp.dataset.attTitleIdx);
            if (attachments[i]) attachments[i].title = inp.value;
          });
        });
        attListEl.querySelectorAll('[data-rm-att]').forEach((btn) => {
          btn.addEventListener('click', () => {
            attachments.splice(Number(btn.dataset.rmAtt), 1);
            syncAttDom();
          });
        });
      }
      syncAttDom();

      // Add YouTube
      m.querySelector('#btnAddYt').addEventListener('click', () => {
        const rawUrl = m.querySelector('#inpYtUrl').value.trim();
        const title = m.querySelector('#inpYtTitle').value.trim();
        const vid = extractYouTubeId(rawUrl);
        if (!vid) {
          showToast('Link YouTube không hợp lệ. Thầy dán link dạng youtube.com/watch?v=... hoặc youtu.be/... hoặc mã <iframe>.', 'error');
          return;
        }
        attachments.push({ type: 'youtube', videoId: vid, title });
        m.querySelector('#inpYtUrl').value = '';
        m.querySelector('#inpYtTitle').value = '';
        syncAttDom();
      });

      // Add External Link
      m.querySelector('#btnAddLink').addEventListener('click', () => {
        let url = m.querySelector('#inpLinkUrl').value.trim();
        const title = m.querySelector('#inpLinkTitle').value.trim();
        if (!url) {
          showToast('Vui lòng nhập đường link.', 'error');
          return;
        }
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
        // If teacher pasted a YouTube URL into link box by habit, auto-upgrade to embedded video!
        const ytId = extractYouTubeId(url);
        if (ytId) {
          attachments.push({ type: 'youtube', videoId: ytId, title });
        } else {
          attachments.push({ type: 'link', url, title });
        }
        m.querySelector('#inpLinkUrl').value = '';
        m.querySelector('#inpLinkTitle').value = '';
        syncAttDom();
      });

      // Upload Files (Images, Video, Audio, PDF, Word, PPT, Excel, ZIP...) with #432 animated dropzone
      const MAX_FILE_BYTES = 20 * 1024 * 1024;
      mountAnimatedDropzone(m.querySelector('#btnPickPostFiles'), {
        inputId: 'inpPostFiles',
        accept: 'image/*,video/*,audio/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.rtf,.odt,.ods,.odp,.html,.htm,.zip,.rar,.7z',
        multiple: true,
        compact: true,
        idleTitle: 'Kéo thả tệp đính kèm vào đây',
        dragTitle: 'Thả tệp để tải lên bài viết',
        subNote: 'chọn nhiều tệp · tối đa 20 MB/tệp',
        hintText: 'Ảnh, Video (MP4/WebM/MOV), Âm thanh (MP3), PDF, Word, PowerPoint, Excel, ZIP...',
        maxBytes: MAX_FILE_BYTES,
        onProcessFiles: async (files) => {
          uploadingCount += files.length;
          saveBtn.disabled = true;
          const uploaded = [];
          try {
            for (const f of files) {
              if (f.size > MAX_FILE_BYTES) {
                const isVid = getFileTypeMeta(f.name, f.type).kind === 'video';
                throw new Error(
                  isVid
                    ? `Tệp vượt quá 20 MB (${formatFileSize(f.size)}). Với video dung lượng lớn, thầy nên up lên YouTube (Không công khai) rồi dán link để không tốn bộ nhớ Supabase.`
                    : `Tệp vượt quá giới hạn 20 MB (${formatFileSize(f.size)}).`
                );
              }
              const b64 = await fileToBase64(f);
              const res = await api.uploadFile({
                fileName: f.name,
                mimeType: f.type || 'application/octet-stream',
                base64Data: b64,
              });
              const meta = res.file;
              uploaded.push({
                type: 'file',
                fileId: meta.id,
                fileName: meta.fileName,
                mimeType: meta.mimeType,
                size: meta.size,
                url: meta.url,
                title: meta.fileName,
              });
            }
            return uploaded;
          } finally {
            uploadingCount = Math.max(0, uploadingCount - files.length);
            saveBtn.disabled = uploadingCount > 0;
          }
        },
        onComplete: (uploaded) => {
          if (Array.isArray(uploaded) && uploaded.length) {
            attachments.push(...uploaded);
            syncAttDom();
          }
        },
        onError: (err) => {
          showToast(err?.message || 'Lỗi tải tệp lên.', 'error');
        },
      });

      // Target class toggle
      const targetAllChk = m.querySelector('#postTargetAll');
      const clsWrap = m.querySelector('#postClassPicks');
      targetAllChk.addEventListener('change', () => {
        clsWrap.style.opacity = targetAllChk.checked ? '0.4' : '1';
        clsWrap.style.pointerEvents = targetAllChk.checked ? 'none' : 'auto';
      });

      m.querySelector('#mCancelPost').addEventListener('click', closeModal);
      saveBtn.addEventListener('click', async () => {
        // Auto-commit any pending YouTube or Link typed in input boxes if teacher forgot to click '+'
        const pendingYt = m.querySelector('#inpYtUrl').value.trim();
        if (pendingYt) {
          const vid = extractYouTubeId(pendingYt);
          if (vid) {
            attachments.push({ type: 'youtube', videoId: vid, title: m.querySelector('#inpYtTitle').value.trim() });
            m.querySelector('#inpYtUrl').value = '';
            m.querySelector('#inpYtTitle').value = '';
          }
        }
        let pendingLk = m.querySelector('#inpLinkUrl').value.trim();
        if (pendingLk) {
          if (!/^https?:\/\//i.test(pendingLk)) pendingLk = 'https://' + pendingLk;
          const ytId = extractYouTubeId(pendingLk);
          const lkTitle = m.querySelector('#inpLinkTitle').value.trim();
          if (ytId) attachments.push({ type: 'youtube', videoId: ytId, title: lkTitle });
          else attachments.push({ type: 'link', url: pendingLk, title: lkTitle });
          m.querySelector('#inpLinkUrl').value = '';
          m.querySelector('#inpLinkTitle').value = '';
        }

        const targetAll = targetAllChk.checked;
        const targetClasses = Array.from(m.querySelectorAll('.post-cls-chk:checked')).map((c) => c.value);
        if (!targetAll && targetClasses.length === 0) {
          showToast('Vui lòng chọn ít nhất 1 lớp hoặc chọn "Tất cả lớp".', 'error');
          return;
        }
        const payload = {
          title: m.querySelector('#postTitle').value.trim(),
          content: m.querySelector('#postContent').value.trim(),
          targetAll,
          targetClasses,
          pinned: m.querySelector('#postPinned').checked,
          attachments,
        };
        if (!payload.title && !payload.content && payload.attachments.length === 0) {
          showToast('Vui lòng nhập nội dung hoặc đính kèm ít nhất 1 video / tài liệu.', 'error');
          return;
        }
        try {
          if (existing) {
            await api.updatePost(existing.id, payload);
            showToast('Đã cập nhật bài viết!', 'success');
          } else {
            await api.createPost(payload);
            showToast('Đã đăng bài lên bảng tin lớp học!', 'success');
          }
          closeModal();
          await onSaved?.();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    },
  });
}
