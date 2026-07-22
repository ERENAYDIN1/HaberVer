const TOKEN_ANAHTARI = "greenasset-token";

export function tokenAl(): string | null {
  return localStorage.getItem(TOKEN_ANAHTARI);
}

export function tokenKaydet(token: string): void {
  localStorage.setItem(TOKEN_ANAHTARI, token);
}

export function tokenSil(): void {
  localStorage.removeItem(TOKEN_ANAHTARI);
}

/** Fetch isteklerine eklenecek Authorization basligi (token varsa). */
export function authHeader(): Record<string, string> {
  const token = tokenAl();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
