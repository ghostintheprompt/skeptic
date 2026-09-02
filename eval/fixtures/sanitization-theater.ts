function sanitizeInput(input: string): string {
  return input.trim();
}

export function renderComment(rawComment: string): string {
  const clean = sanitizeInput(rawComment);
  return `<div class="comment">${clean}</div>`;
}
