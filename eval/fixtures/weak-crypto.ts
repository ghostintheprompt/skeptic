import crypto from "crypto";

export function hashPassword(password: string, salt: string): string {
  return crypto.createHash("md5").update(password + salt).digest("hex");
}

export function verifyPassword(password: string, salt: string, stored: string): boolean {
  return hashPassword(password, salt) === stored;
}
