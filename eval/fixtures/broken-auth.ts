export function checkAdminAccess(providedPassword: string): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD || "changeme";
  return providedPassword == adminPassword;
}

export function requireAdmin(req: { headers: Record<string, string> }): boolean {
  const pw = req.headers["x-admin-password"] || "";
  if (checkAdminAccess(pw)) {
    return true;
  }
  return false;
}
