import type { AssetType } from "../types/asset";
import type {
  ReportFeature,
  ReportFeatureCollection,
  ReportStatus,
} from "../types/report";
import { MEDIA_ORIGIN, istek, istekForm } from "./http";

/** Rolatif photo_url'i (orn. /media/reports/x.png) tam URL'e cevirir. */
export function fotoUrl(yol: string | null): string | null {
  return yol ? `${MEDIA_ORIGIN}${yol}` : null;
}

export interface IhbarGirdi {
  name: string;
  type: AssetType;
  longitude: number;
  latitude: number;
  note?: string;
  photo?: File | null;
}

export function createReport(girdi: IhbarGirdi): Promise<ReportFeature> {
  const form = new FormData();
  form.set("name", girdi.name);
  form.set("type", girdi.type);
  form.set("longitude", String(girdi.longitude));
  form.set("latitude", String(girdi.latitude));
  if (girdi.note) form.set("note", girdi.note);
  if (girdi.photo) form.set("photo", girdi.photo);
  return istekForm<ReportFeature>("/reports", form);
}

export function myReports() {
  return istek<ReportFeatureCollection>("/reports/mine");
}

export function listReports(status?: ReportStatus) {
  const q = status ? `?status=${status}` : "";
  return istek<ReportFeatureCollection>(`/reports${q}`);
}

/** Ihbari onaylar (bakim bekleyen bir varlik olusur). `type` verilirse personel
 *  vatandasin sectigi turu duzeltmis olur - hem olusan varlik hem arsivlenen
 *  ihbar kaydi bu turle yazilir. Verilmezse vatandasin turu aynen kabul edilir. */
export function approveReport(id: string, type?: AssetType) {
  return istek<ReportFeature>(`/reports/${id}/onayla`, {
    method: "POST",
    ...(type ? { body: JSON.stringify({ type }) } : {}),
  });
}

export function rejectReport(id: string, review_note?: string) {
  return istek<ReportFeature>(`/reports/${id}/reddet`, {
    method: "POST",
    body: JSON.stringify({ review_note: review_note || null }),
  });
}

/** Reddedilen bir ihbarin reddini geri alir: ihbar tekrar "beklemede" olur ve
 *  ret nedeni/inceleyen bilgisi temizlenir (yalnizca personel). */
export function reopenReport(id: string) {
  return istek<ReportFeature>(`/reports/${id}/geri-al`, { method: "POST" });
}
