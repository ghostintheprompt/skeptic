let currentSessionToken: string | null = null;

export function login(userId: string): string {
  currentSessionToken = `${userId}-${Date.now()}`;
  return currentSessionToken;
}

export function getActiveToken(): string | null {
  return currentSessionToken;
}

export function isAuthenticated(providedToken: string): boolean {
  return providedToken === currentSessionToken;
}
