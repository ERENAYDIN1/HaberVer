import { turAdi } from "../data/turSozlugu";
import { ASSET_STATUS_LABELS } from "../types/asset";
import type { AssetFeatureCollection } from "../types/asset";
import { TALEP_DURUM_ETIKETLERI, talepNoktasi } from "../types/talep";
import type { TalepFeatureCollection } from "../types/talep";

function indir(icerik: string, dosyaAdi: string, mimeType: string) {
  const blob = new Blob([icerik], { type: `${mimeType};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = dosyaAdi;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function zamanDamgasi(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

/* TR Excel noktali virgulu ayirici bekler (ondalik ayirici virgul oldugundan). */
const AYIRICI = ";";

function csvAlan(deger: string | number | null): string {
  if (deger === null || deger === undefined) return "";
  const metin =
    typeof deger === "number" ? String(deger).replace(".", ",") : String(deger);
  return `"${metin.replace(/"/g, '""')}"`;
}

export function csvIndir(data: AssetFeatureCollection) {
  const basliklar = [
    "id",
    "isim",
    "tip",
    "durum",
    "boylam",
    "enlem",
    "kurulum_tarihi",
    "marka_model",
    "olusturulma",
  ];

  const satirlar = data.features.map((f) => {
    const p = f.properties;
    const [lng, lat] = f.geometry.coordinates;
    return [
      p.id,
      p.name,
      turAdi(p.type),
      ASSET_STATUS_LABELS[p.status],
      lng,
      lat,
      p.install_date,
      p.brand_model,
      p.created_at,
    ]
      .map(csvAlan)
      .join(AYIRICI);
  });

  // BOM: Excel'in UTF-8 Turkce karakterleri dogru okumasi icin gerekli.
  const icerik =
    "﻿" + [basliklar.join(AYIRICI), ...satirlar].join("\r\n");
  indir(icerik, `haberver-${zamanDamgasi()}.csv`, "text/csv");
}

export function jsonIndir(data: AssetFeatureCollection) {
  indir(
    JSON.stringify(data, null, 2),
    `haberver-${zamanDamgasi()}.geojson`,
    "application/geo+json"
  );
}

export function talepCsvIndir(data: TalepFeatureCollection) {
  const basliklar = [
    "id",
    "isim",
    "tip",
    "gorunum",
    "boylam",
    "enlem",
    "aciklama",
    "olusturulma",
  ];

  const satirlar = data.features.map((f) => {
    const p = f.properties;
    const n = talepNoktasi(f);
    return [
      p.id,
      p.name,
      turAdi(p.type),
      TALEP_DURUM_ETIKETLERI[p.gorunum ?? p.status],
      n?.[0] ?? null,
      n?.[1] ?? null,
      p.note,
      p.created_at,
    ]
      .map(csvAlan)
      .join(AYIRICI);
  });

  const icerik =
    "﻿" + [basliklar.join(AYIRICI), ...satirlar].join("\r\n");
  indir(icerik, `haberver-talepler-${zamanDamgasi()}.csv`, "text/csv");
}

export function talepJsonIndir(data: TalepFeatureCollection) {
  indir(
    JSON.stringify(data, null, 2),
    `haberver-talepler-${zamanDamgasi()}.geojson`,
    "application/geo+json"
  );
}
