/**
 * Crisp SVG QR Code helper for Classroom Projector.
 * Uses qrcode-generator (loaded from jsDelivr) with clean SVG output & fallback.
 */
window.LiveQR = (function () {
  function renderSvg(container, text, size = 240) {
    if (!container) return;
    container.innerHTML = "";
    if (!text) return;

    if (typeof window.qrcode === "function") {
      try {
        const qr = window.qrcode(0, "M");
        qr.addData(text);
        qr.make();
        const count = qr.getModuleCount();
        const quiet = 3;
        const total = count + quiet * 2;
        const rects = [];
        for (let r = 0; r < count; r++) {
          for (let c = 0; c < count; c++) {
            if (qr.isDark(r, c)) {
              rects.push(`<rect x="${c + quiet}" y="${r + quiet}" width="1.03" height="1.03" rx="0.14"/>`);
            }
          }
        }
        container.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${size}" height="${size}" role="img" aria-label="Mã QR vào phòng chơi" style="display:block;border-radius:14px;background:#ffffff;">
            <rect width="${total}" height="${total}" fill="#ffffff"/>
            <g fill="#0f172a">${rects.join("")}</g>
          </svg>
        `;
        return;
      } catch (err) {
        console.warn("QR local render fallback:", err);
      }
    }

    // Fallback image via qrserver if CDN script was blocked
    const img = document.createElement("img");
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=10&data=${encodeURIComponent(text)}`;
    img.alt = "Mã QR vào phòng chơi";
    img.width = size;
    img.height = size;
    img.style.borderRadius = "14px";
    img.style.display = "block";
    container.appendChild(img);
  }

  return { renderSvg };
})();
