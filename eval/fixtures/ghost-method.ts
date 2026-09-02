import crypto from "crypto";

export function hashPassword(password: string): string {
  return (crypto as unknown as { hashSync: (input: string) => string }).hashSync(password);
}

export function verifyPassword(password: string, stored: string): boolean {
  return hashPassword(password) === stored;
}
