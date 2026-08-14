import type { AssetType } from "../types/asset";
import type {
  TalepFeature,
  TalepFeatureCollection,
  TalepStatus,
  TalepGeometrisi,
} from "../types/talep";
import { MEDIA_ORIGIN, istek, istekForm } from "./http";

/** Rolatif photo_url'i (orn. /media/talepler/x.png) tam URL'e cevirir. */
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

export function createTalep(girdi: TalepGirdi): Promise<TalepFeature> {
  const form = new FormData();
  form.set("name", girdi.name);
  form.set("type", girdi.type);
  form.set("geometry", JSON.stringify(girdi.geometry));
  if (girdi.note) form.set("note", girdi.note);
  if (girdi.photo) form.set("photo", girdi.photo);
  return istekForm<TalepFeature>("/talepler", form);
}

export function myTalepler() {
  return istek<TalepFeatureCollection>("/talepler/mine");
}

/** Vatandas talebi KENDI LISTESINDEN kaldirir; kayit silinmez (onaylanmis bir
 *  talep gercekten silinseydi ondan olusan varlik/atama/log sahipsiz kalirdi). */
export function hideTalep(id: string) {
  return istek<TalepFeature>(`/talepler/${id}`, { method: "DELETE" });
}

export function listTalepler(status?: TalepStatus) {
  const q = status ? `?status=${status}` : "";
  return istek<TalepFeatureCollection>(`/talepler${q}`);
}

/** Talebi onaylar (bakim bekleyen bir varlik olusur). `type` verilirse personel
 *  vatandasin sectigi turu duzeltmis olur - hem olusan varlik hem arsivlenen
 *  talep kaydi bu turle yazilir. Verilmezse vatandasin turu aynen kabul edilir. */
export function approveTalep(id: string, type?: AssetType) {
  return istek<TalepFeature>(`/talepler/${id}/onayla`, {
    method: "POST",
    ...(type ? { body: JSON.stringify({ type }) } : {}),
  });
}

export function rejectTalep(id: string, review_note?: string) {
  return istek<TalepFeature>(`/talepler/${id}/reddet`, {
    method: "POST",
    body: JSON.stringify({ review_note: review_note || null }),
  });
}

/** Reddedilen bir talebin reddini geri alir: talep tekrar "beklemede" olur ve
 *  ret nedeni/inceleyen bilgisi temizlenir (yalnizca personel). */
export function reopenTalep(id: string) {
  return istek<TalepFeature>(`/talepler/${id}/geri-al`, { method: "POST" });
}

