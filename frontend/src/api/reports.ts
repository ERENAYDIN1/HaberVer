import type { AssetType } from "../types/asset";
import type {
  ReportFeature,
  ReportFeatureCollection,
  ReportStatus,
  TalepGeometrisi,
} from "../types/report";
import { MEDIA_ORIGIN, istek, istekForm } from "./http";

/** Rolatif photo_url'i (orn. /media/reports/x.png) tam URL'e cevirir. */
export function fotoUrl(yol: string | null): string | null {
  return yol ? `${MEDIA_ORIGIN}${yol}` : null;
}

export interface TalepGirdi {
  name: string;
  type: AssetType;
  /** Nokta, cizgi veya alan. Tek koordinat cifti yerine GeoJSON gonderilir:
   *  bir yol catlagi nokta degildir. Temsil noktasini backend turetir. */
  geometry: TalepGeometrisi;
  note?: string;
  photo?: File | null;
}

export function createReport(girdi: TalepGirdi): Promise<ReportFeature> {
  const form = new FormData();
  form.set("name", girdi.name);
  form.set("type", girdi.type);
  form.set("geometry", JSON.stringify(girdi.geometry));
  if (girdi.note) form.set("note", girdi.note);
  if (girdi.photo) form.set("photo", girdi.photo);
  return istekForm<ReportFeature>("/reports", form);
}

export function myReports() {
  return istek<ReportFeatureCollection>("/reports/mine");
}

/** Vatandas talebi KENDI LISTESINDEN kaldirir; kayit silinmez (onaylanmis bir
 *  talep gercekten silinseydi ondan olusan varlik/atama/log sahipsiz kalirdi). */
export function hideReport(id: string) {
  return istek<ReportFeature>(`/reports/${id}`, { method: "DELETE" });
}

export function listReports(status?: ReportStatus) {
  const q = status ? `?status=${status}` : "";
  return istek<ReportFeatureCollection>(`/reports${q}`);
}

/** Talebi onaylar (bakim bekleyen bir varlik olusur). `type` verilirse personel
 *  vatandasin sectigi turu duzeltmis olur - hem olusan varlik hem arsivlenen
 *  talep kaydi bu turle yazilir. Verilmezse vatandasin turu aynen kabul edilir. */
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

/** Reddedilen bir talebin reddini geri alir: talep tekrar "beklemede" olur ve
 *  ret nedeni/inceleyen bilgisi temizlenir (yalnizca personel). */
export function reopenReport(id: string) {
  return istek<ReportFeature>(`/reports/${id}/geri-al`, { method: "POST" });
}

