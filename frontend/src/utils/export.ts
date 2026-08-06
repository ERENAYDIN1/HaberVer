import { turAdi } from "../data/turSozlugu";
import { ASSET_STATUS_LABELS } from "../types/asset";
import type { AssetFeatureCollection } from "../types/asset";

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

/* TR yerelindeki Excel liste ayirici olarak noktali virgul bekler; virgulle
   yazilan dosyayi tek sutuna sikistirir. Ayrica ondalik ayirici da virgul
   oldugundan koordinatlar nokta yerine virgulle yazilir. */
const AYIRICI = ";";

function csvAlan(deger: string | number | null): string {
  if (deger === null || deger === undefined) return "";
  // Sayilar TR ondalik ayiricisiyla yazilir ki Excel bunlari sayi olarak tanisin.
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
  indir(icerik, `greenasset-${zamanDamgasi()}.csv`, "text/csv");
}

export function jsonIndir(data: AssetFeatureCollection) {
  indir(
    JSON.stringify(data, null, 2),
    `greenasset-${zamanDamgasi()}.geojson`,
    "application/geo+json"
  );
}
