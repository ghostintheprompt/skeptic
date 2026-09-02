import React from "react";

// React escapes interpolated text content by default - {comment} below is
// not raw HTML injection the way template-literal interpolation would be.
export function Comment({ comment }: { comment: string }) {
  return React.createElement("div", { className: "comment" }, comment);
}
