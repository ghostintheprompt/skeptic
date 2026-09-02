function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderComment(rawComment: string): string {
  const clean = escapeHtml(rawComment);
  return `<div class="comment">${clean}</div>`;
}
