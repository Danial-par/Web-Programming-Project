const STORAGE_KEY = "la_noire_auth_tokens";

export interface StoredTokens {
  access: string;
  refresh: string;
}

export function saveTokens(tokens: StoredTokens) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  } catch {
    // ignore storage errors (private browsing, etc.)
  }
}

export function clearTokens() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function getTokens(): StoredTokens | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredTokens;
    if (typeof parsed.access === "string" && typeof parsed.refresh === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function getAuthToken(): string | null {
  return getTokens()?.access ?? null;
}

