import { api } from './api.js?v=20261122f';
import { escapeHtml, escapeAttr, formatDateTimeVN } from './exam-engine.js?v=20261122f';

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

export function bindFeedEvents(container, { uiHelpers, onEdit, onDelete, onTogglePin } = {}) {
  const { openModal, closeModal } = uiHelpers;

  // Built-in PDF viewer popup modal (plus open in new tab)
  container.querySelectorAll('[data-view-pdf]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const url = btn.dataset.viewPdf;
      const title = btn.dataset.pdfTitle || 'Tài liệu PDF';
      openModal({
        title,
        wide: true,
        bodyHtml: `
          <div style="width:100%; height:68vh; border-radius:10px; overflow:hidden; border:1px solid var(--border); background:#f1f5f9;">
            <iframe src="${escapeAttr(url)}" style="width:100%; height:100%; border:none;" title="${escapeAttr(title)}"></iframe>
          </div>
        `,
        footerHtml: `
          <a class="btn btn-secondary" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">Mở tab riêng ↗</a>
          <a class="btn btn-secondary" href="${escapeAttr(url)}?download=1" download>Tải về PDF</a>
          <button class="btn btn-primary" id="mClosePdfView">Đóng</button>
        `,
        onMount: (m) => m.querySelector('#mClosePdfView').addEventListener('click', closeModal),
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

        <!-- Drag & Drop / Multi-File Upload Zone (Images, Video, Audio, PDF, Word, PPT, Excel, ZIP...) -->
        <input
          type="file"
          id="inpPostFiles"
          multiple
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.rtf,.odt,.ods,.odp,.html,.htm,.zip,.rar,.7z"
          hidden
        />
        <div class="composer-upload-zone" id="btnPickPostFiles" role="button" tabindex="0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <div>
            <div class="composer-upload-title" id="uploadZoneTitle">Tải tệp từ máy tính (kéo thả hoặc bấm chọn nhiều tệp)</div>
            <div class="composer-upload-sub">Ảnh, Video (MP4/WebM/MOV), Âm thanh (MP3), PDF, Word, PowerPoint, Excel, ZIP... (tối đa 20 MB/tệp)</div>
          </div>
        </div>

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

      // Upload Files (Images, Video, Audio, PDF, Word, PPT, Excel, ZIP...) with drag & drop
      const fileInp = m.querySelector('#inpPostFiles');
      const pickZone = m.querySelector('#btnPickPostFiles');
      const uploadTitleEl = m.querySelector('#uploadZoneTitle');
      const MAX_FILE_BYTES = 20 * 1024 * 1024;

      async function handleUploadFiles(fileList) {
        const files = Array.from(fileList || []);
        if (!files.length) return;
        uploadingCount += files.length;
        pickZone.classList.add('is-uploading');
        uploadTitleEl.textContent = `Đang tải lên ${uploadingCount} tệp...`;
        saveBtn.disabled = true;

        for (const f of files) {
          try {
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
            attachments.push({
              type: 'file',
              fileId: meta.id,
              fileName: meta.fileName,
              mimeType: meta.mimeType,
              size: meta.size,
              url: meta.url,
              title: meta.fileName,
            });
            syncAttDom();
          } catch (err) {
            showToast(`Lỗi tải tệp ${f.name}: ${err.message}`, 'error');
          } finally {
            uploadingCount = Math.max(0, uploadingCount - 1);
            if (uploadingCount > 0) {
              uploadTitleEl.textContent = `Đang tải lên ${uploadingCount} tệp...`;
            }
          }
        }
        pickZone.classList.remove('is-uploading');
        uploadTitleEl.textContent = 'Tải tệp từ máy tính (kéo thả hoặc bấm chọn nhiều tệp)';
        saveBtn.disabled = false;
      }

      pickZone.addEventListener('click', () => {
        if (!pickZone.classList.contains('is-uploading')) fileInp.click();
      });
      pickZone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (!pickZone.classList.contains('is-uploading')) fileInp.click();
        }
      });
      pickZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        pickZone.classList.add('drag-over');
      });
      pickZone.addEventListener('dragleave', () => pickZone.classList.remove('drag-over'));
      pickZone.addEventListener('drop', (e) => {
        e.preventDefault();
        pickZone.classList.remove('drag-over');
        if (e.dataTransfer?.files?.length) {
          handleUploadFiles(e.dataTransfer.files);
        }
      });
      fileInp.addEventListener('change', async () => {
        const files = fileInp.files;
        fileInp.value = '';
        await handleUploadFiles(files);
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
