import crypto from "crypto";

export function checkAdminAccess(providedPassword: string): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD || "";
  // Fail closed if the secret itself is missing/empty - otherwise an unset
  // ADMIN_PASSWORD plus an empty providedPassword would compare two empty
  // buffers as equal and grant access with no real credential at all.
  if (adminPassword.length === 0) return false;
  const a = Buffer.from(providedPassword);
  const b = Buffer.from(adminPassword);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
