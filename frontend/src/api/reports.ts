import { authHeader } from "../auth/token";
import type { AssetType } from "../types/asset";
import type {
  ReportFeature,
  ReportFeatureCollection,
  ReportStatus,
} from "../types/report";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api";

/** Backend origin'i (foto gibi statik dosyalar icin; /api eki cikarilir). */
export const MEDIA_ORIGIN = BASE_URL.replace(/\/api\/?$/, "");

/** Rolatif photo_url'i (orn. /media/reports/x.png) tam URL'e cevirir. */
export function fotoUrl(yol: string | null): string | null {
  return yol ? `${MEDIA_ORIGIN}${yol}` : null;
}

async function hataMesaji(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail)) {
      return body.detail.map((d: { msg: string }) => d.msg).join(" · ");
    }
  } catch {
    // yoksay
  }
  return `İstek başarısız oldu (HTTP ${response.status})`;
}

export interface IhbarGirdi {
  name: string;
  type: AssetType;
  longitude: number;
  latitude: number;
  note?: string;
  photo?: File | null;
}

export async function createReport(girdi: IhbarGirdi): Promise<ReportFeature> {
  const form = new FormData();
  form.set("name", girdi.name);
  form.set("type", girdi.type);
  form.set("longitude", String(girdi.longitude));
  form.set("latitude", String(girdi.latitude));
  if (girdi.note) form.set("note", girdi.note);
  if (girdi.photo) form.set("photo", girdi.photo);

  // Content-Type elle verilmez; tarayici multipart boundary'sini kendisi ekler.
  const response = await fetch(`${BASE_URL}/reports`, {
    method: "POST",
    headers: authHeader(),
    body: form,
  });
  if (!response.ok) throw new Error(await hataMesaji(response));
  return response.json() as Promise<ReportFeature>;
}

async function istekJson<T>(yol: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${yol}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...authHeader(), ...init?.headers },
  });
  if (!response.ok) throw new Error(await hataMesaji(response));
  return response.json() as Promise<T>;
}

export function myReports() {
  return istekJson<ReportFeatureCollection>("/reports/mine");
}

export function listReports(status?: ReportStatus) {
  const q = status ? `?status=${status}` : "";
  return istekJson<ReportFeatureCollection>(`/reports${q}`);
}

export function approveReport(id: string) {
  return istekJson<ReportFeature>(`/reports/${id}/onayla`, { method: "POST" });
}

export function rejectReport(id: string, review_note?: string) {
  return istekJson<ReportFeature>(`/reports/${id}/reddet`, {
    method: "POST",
    body: JSON.stringify({ review_note: review_note || null }),
  });
}
