import { authHeader } from "../auth/token";
import type { TokenResponse, User, UserRole } from "../types/auth";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api";

/** Backend'in hata govdesini okunabilir tek bir mesaja cevirir. */
async function hataMesaji(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail)) {
      return body.detail.map((d: { msg: string }) => d.msg).join(" · ");
    }
  } catch {
    // JSON degilse asagidaki genel mesaj
  }
  return `İstek başarısız oldu (HTTP ${response.status})`;
}

async function istek<T>(yol: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${yol}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...authHeader(), ...init?.headers },
  });
  if (!response.ok) throw new Error(await hataMesaji(response));
  return response.json() as Promise<T>;
}

export function login(email: string, password: string) {
  return istek<TokenResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function register(email: string, password: string, full_name?: string) {
  return istek<TokenResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, full_name: full_name || null }),
  });
}

export function me() {
  return istek<User>("/auth/me");
}

// --- Admin: kullanici yonetimi ---
export function listUsers() {
  return istek<User[]>("/users");
}

export function createUser(data: {
  email: string;
  password: string;
  full_name?: string;
  role: UserRole;
}) {
  return istek<User>("/users", {
    method: "POST",
    body: JSON.stringify({ ...data, full_name: data.full_name || null }),
  });
}
