import { useState } from "react";

import { bolgeOlustur } from "../api/bolgeler";
import { useAuth } from "../auth/AuthContext";
import { useDepartmanlar } from "../hooks/useDepartmanlar";
import { departmanBul } from "../types/departman";
import type { Bolge, BolgeTipi } from "../types/bolge";
import { alanEtiketi, cokHalkaliAlanM2, mesafeEtiketi, toplamMesafeMetre } from "../utils/geo";
import { RENK_PALETI } from "./CizimPaneli";
import Modal from "./Modal";

/** Haritada cizilmis, henuz kaydedilmemis bir cizim (alan ya da cizgi). */
export interface BolgeTaslagi {
  tip: BolgeTipi;
  /** Halka listesi; cizgide tek elemanli. */
  noktalar: [number, number][][];
  renk: string;
  /** Form acilirken ad alanina onerilecek deger. */
  onerilenAd?: string;
  /** Cizimin geldigi kaynak - kaydedilince cizim listesinden dusurulur:
   *  tamamlanan alanin id'si ya da mesafe olcumu icin "olcum". */
  kaynak?: { tip: "alan"; id: string } | { tip: "olcum" };
}

interface Props {
  taslak: BolgeTaslagi | null;
  onKapat: () => void;
  onKaydedildi: (bolge: Bolge) => void;
}

/** Cizilen bir alani/cizgiyi adlandirip kalici bir "bölge" olarak kaydeder.
 *  Ekibe atama burada degil, Bölgeler panelinde yapilir - kaydetme ile atama
 *  ayri kararlar (bir bolge gun icinde farkli ekiplere verilebilir). */
export default function BolgeKaydetModal({ taslak, onKapat, onKaydedildi }: Props) {
  const [ad, setAd] = useState("");
  const [aciklama, setAciklama] = useState("");
  const [renk, setRenk] = useState(taslak?.renk ?? "#059669");
  // Mudurluk secimi YALNIZCA admin icindir: departmani olan personelin kaydi
  // backend'de zaten kendi mudurlugune yazilir (gonderilen deger yok sayilir),
  // ona secim sunmak yaniltici olurdu.
  const { user } = useAuth();
  const adminMi = user?.role === "admin";
  const { data: departmanlar } = useDepartmanlar();
  const [departman, setDepartman] = useState("");
  const kendiDepartmani = departmanBul(departmanlar, user?.departman);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  // Taslak degisince (yeni bir cizim kaydedilecek) formu bastan kur.
  const [sonTaslak, setSonTaslak] = useState<BolgeTaslagi | null>(null);
  if (taslak !== sonTaslak) {
    setSonTaslak(taslak);
    setAd(taslak?.onerilenAd ?? "");
    setAciklama("");
    setRenk(taslak?.renk ?? "#059669");
    setDepartman("");
    setHata(null);
  }

  const alan = taslak?.tip === "alan";
  const olcu = !taslak
    ? ""
    : alan
      ? alanEtiketi(cokHalkaliAlanM2(taslak.noktalar))
      : mesafeEtiketi(toplamMesafeMetre(taslak.noktalar[0]));

  const kaydet = async () => {
    if (!taslak || !ad.trim()) return;
    setKaydediliyor(true);
    setHata(null);
    try {
      const bolge = await bolgeOlustur({
        ad: ad.trim(),
        aciklama: aciklama.trim() || null,
        tip: taslak.tip,
        renk,
        departman: departman || null,
        noktalar: taslak.noktalar,
      });
      onKaydedildi(bolge);
      onKapat();
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setKaydediliyor(false);
    }
  };

  return (
    <Modal
      acik={taslak !== null}
      baslik={alan ? "Görev Bölgesi Olarak Kaydet" : "Çizgiyi Kaydet"}
      onKapat={onKapat}
    >
      <div className="space-y-3">
        <p className="border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {alan
            ? "Kaydedilen alan Bölgeler panelinde durur ve bir saha ekibine görev bölgesi olarak atanabilir."
            : "Kaydedilen çizgi Bölgeler panelinde durur (güzergâh/ölçüm kaydı). Çizgiler ekibe atanamaz."}
          <span className="mt-1 block font-medium text-slate-800">
            {alan ? "Büyüklük" : "Uzunluk"}: {olcu}
          </span>
        </p>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            Ad <span className="text-red-500">*</span>
          </span>
          <input
            autoFocus
            value={ad}
            onChange={(e) => setAd(e.target.value)}
            maxLength={120}
            placeholder={alan ? "Örn. Kadıköy Sahil Parkı" : "Örn. Bakım turu güzergâhı"}
            className="w-full border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            Açıklama
          </span>
          <textarea
            value={aciklama}
            onChange={(e) => setAciklama(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="İsteğe bağlı not (örn. bu hafta budama yapılacak)"
            className="w-full resize-none border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
        </label>

        {adminMi ? (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              Müdürlük
            </span>
            <select
              value={departman}
              onChange={(e) => setDepartman(e.target.value)}
              className="w-full border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            >
              <option value="">Genel (tüm müdürlükler görür)</option>
              {(departmanlar ?? []).map((d) => (
                <option key={d.kod} value={d.kod}>
                  {d.ad}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] text-slate-500">
              Seçilen müdürlüğün dışındaki personel bu kaydı göremez ve kendi
              ekibine atayamaz.
            </span>
          </label>
        ) : (
          kendiDepartmani && (
            <p className="text-[11px]" style={{ color: kendiDepartmani.renk }}>
              <span className="font-medium">{kendiDepartmani.ad}</span>
              <span className="text-slate-400">
                {" "}
                · kayıt bu müdürlüğe ait olacak
              </span>
            </p>
          )
        )}

        <div>
          <span className="mb-1.5 block text-xs font-medium text-slate-600">Renk</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {RENK_PALETI.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => setRenk(hex)}
                title={hex}
                aria-label={hex}
                className={`h-6 w-6 rounded-full border-2 transition ${
                  renk === hex ? "border-slate-800" : "border-white ring-1 ring-slate-300"
                }`}
                style={{ background: hex }}
              />
            ))}
            <label
              title="Özel renk"
              className="relative flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-dashed border-slate-400 text-xs leading-none text-slate-500 hover:border-slate-600"
            >
              +
              <input
                type="color"
                value={renk}
                onChange={(e) => setRenk(e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
          </div>
        </div>

        {hata && (
          <p className="border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {hata}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onKapat}
            className="border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Vazgeç
          </button>
          <button
            onClick={kaydet}
            disabled={!ad.trim() || kaydediliyor}
            className="bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {kaydediliyor ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
