import { authHeader, tokenSil } from "../auth/token";
import type { LogEntry } from "../types/log";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api";

async function hataMesaji(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail)) {
      return body.detail.map((d: { msg: string }) => d.msg).join(" · ");
    }
  } catch {
    // govde JSON degilse asagidaki genel mesaja dusulur
  }
  return `İstek başarısız oldu (HTTP ${response.status})`;
}

async function istek<T>(yol: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${yol}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...authHeader(), ...init?.headers },
  });

  if (response.status === 401) {
    tokenSil();
    window.location.href = "/giris";
    throw new Error("Oturum sona erdi, lütfen tekrar giriş yapın");
  }

  if (!response.ok) {
    throw new Error(await hataMesaji(response));
  }

  return response.json() as Promise<T>;
}

export function listLogs(limit = 200) {
  return istek<LogEntry[]>(`/logs?limit=${limit}`);
}
