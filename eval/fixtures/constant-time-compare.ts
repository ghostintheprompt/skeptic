import crypto from "crypto";

export function checkAdminAccess(providedPassword: string): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD || "";
  const a = Buffer.from(providedPassword);
  const b = Buffer.from(adminPassword);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
