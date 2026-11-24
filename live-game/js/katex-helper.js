/**
 * Safe HTML escaping, lightweight markdown (**bold**, *italic*, newlines) & KaTeX math rendering.
 */
window.LiveMath = (function () {
  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatRichText(raw) {
    if (raw == null) return "";
    // Preserve math blocks while formatting bold/italic/newlines
    const placeholders = [];
    let text = String(raw);
    text = text.replace(/\$\$[\s\S]+?\$\$|\$(?:\\.|[^$\\])+\$/g, (m) => {
      const idx = placeholders.length;
      placeholders.push(m);
      return `@@MATH_${idx}@@`;
    });

    text = escapeHtml(text);
    text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");
    text = text.replace(/\n/g, "<br>");

    text = text.replace(/@@MATH_(\d+)@@/g, (_, idx) => escapeHtml(placeholders[Number(idx)] || ""));
    return text;
  }

  function renderMathIn(el) {
    if (!el || typeof window.renderMathInElement !== "function") return;
    try {
      window.renderMathInElement(el, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
          { left: "\\(", right: "\\)", display: false },
          { left: "\\[", right: "\\]", display: true },
        ],
        throwOnError: false,
        strict: "ignore",
      });
    } catch (err) {
      // Fail silently if formula has syntax typo
    }
  }

  const TYPE_META = {
    mcq: { label: "Trắc nghiệm 4 đáp án", short: "Trắc nghiệm", color: "blue", icon: "A" },
    true_false: { label: "Đúng / Sai", short: "Đúng / Sai", color: "purple", icon: "Đ/S" },
    short_answer: { label: "Trả lời ngắn", short: "Trả lời ngắn", color: "teal", icon: "Aa" },
    fill_blank: { label: "Điền vào chỗ trống", short: "Điền chỗ trống", color: "amber", icon: "[_]" },
    drag_order: { label: "Kéo thả sắp xếp", short: "Sắp xếp", color: "indigo", icon: "⇅" },
    drag_match: { label: "Kéo thả ghép đôi", short: "Ghép đôi", color: "rose", icon: "⇄" },
  };

  function getTypeMeta(type) {
    return TYPE_META[type] || TYPE_META.mcq;
  }

  return { escapeHtml, formatRichText, renderMathIn, getTypeMeta, TYPE_META };
})();
