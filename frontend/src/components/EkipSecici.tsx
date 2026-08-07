import { useEffect, useMemo, useState } from "react";

import { departmanAdi } from "../types/departman";
import type { Departman } from "../types/departman";
import {
  MAKS_AKTIF_GOREV,
  YAKA_KISA,
  yakaEtiketi,
  type EkipOzet,
  type Yaka,
} from "../types/saha";
import { mesafeEtiketi, mesafeMetre } from "../utils/geo";
import { IconCheck, IconUsers, IconWarning } from "./icons";

/** Bir ise ekip secme kontrolu. TEK bilesen; varlik, gorev bolgesi ve
 *  guzergah ayni ekrani gorur - hepsi ayni kotayi paylasan "gorev"lerdir
 *  (bkz. backend MAKS_AKTIF_GOREV).
 *
 *  Uc karar bu bilesende yasar:
 *
 *  1. SIRA RASTGELE DEGIL. Ekipler once ISIN MUDURLUGU (otomatik atamanin
 *     bakacagi tek grup), sonra diger mudurlukler; her grubun icinde ise
 *     MESAFEYE gore siralanir. Eski `<option>` listesi ada gore geliyordu ve
 *     personel "en yakin bos ekip hangisi" sorusunu gozle cozmek zorundaydi.
 *  2. DOLU EKIP ENGELLENMEZ, UYARILIR. Kota otomatik dagitimda sert kisittir;
 *     elle atamada yetki personeldedir. En fazla ekip fazla yuklenir.
 *  3. UYARILAR AYRI RENK/SATIRDA DEGIL, TEK BIR ROZET SERIDINDE toplanir -
 *     eski tek satirlik "· karşı yaka (Anadolu) · başka departman (X) · dolu"
 *     dizisi okunmuyordu.
 */

export interface EkipSeciciIsi {
  /** Isin konumu; mesafe siralamasi bunu okur. Bilinmiyorsa siralama ada
   *  duser (mesafe hesaplanamaz, uydurulmaz). */
  konum: [number, number] | null;
  /** Isin dustugu yaka; "karsi yaka" uyarisi bunu karsilastirir. */
  yaka: string | null;
  /** Isin mudurlugu; gruplama ve "baska mudurluk" uyarisi bunu okur. */
  departman: string | null;
}

interface EkipSeciciProps {
  ekipler?: EkipOzet[];
  is: EkipSeciciIsi;
  /** Su an atali olan ekip (varsa) - listede isaretlenir. */
  mevcutWorkerId?: string | null;
  departmanlar?: Departman[];
  /** Secim onaylandiginda; null "atamayi kaldir" demektir. */
  onAta: (workerId: string | null) => void;
  islemde?: boolean;
  /** Atamayi kaldirma secenegi gosterilsin mi (atali kayitlarda anlamli). */
  kaldirilabilir?: boolean;
}

/** Bir ekibin bu is icin durumu; rozetler ve siralama bundan turer. */
interface EkipDurumu {
  ekip: EkipOzet;
  mesafeM: number | null;
  dolu: boolean;
  karsiYaka: boolean;
  baskaMudurluk: boolean;
  mevcut: boolean;
}

function ekipDurumu(
  ekip: EkipOzet,
  is: EkipSeciciIsi,
  mevcutWorkerId: string | null | undefined
): EkipDurumu {
  const mesafeM =
    is.konum && ekip.longitude != null && ekip.latitude != null
      ? mesafeMetre(is.konum, [ekip.longitude, ekip.latitude])
      : null;
  return {
    ekip,
    mesafeM,
    dolu: ekip.aktif_gorev >= MAKS_AKTIF_GOREV,
    karsiYaka: Boolean(ekip.yaka && is.yaka && ekip.yaka !== is.yaka),
    baskaMudurluk: Boolean(
      ekip.departman && is.departman && ekip.departman !== is.departman
    ),
    mevcut: Boolean(mevcutWorkerId && ekip.id === mevcutWorkerId),
  };
}

/** Konumu bilinen ekipler once ve mesafeye gore; konumu bilinmeyenler en
 *  sonda ada gore. Otomatik atama konumu olmayan ekibi hic degerlendirmiyor,
 *  listede de en arkada durmali. */
function mesafeyeGoreSirala(a: EkipDurumu, b: EkipDurumu): number {
  if (a.mesafeM != null && b.mesafeM != null) return a.mesafeM - b.mesafeM;
  if (a.mesafeM != null) return -1;
  if (b.mesafeM != null) return 1;
  const adA = a.ekip.full_name || a.ekip.email;
  const adB = b.ekip.full_name || b.ekip.email;
  return adA.localeCompare(adB, "tr");
}

export default function EkipSecici({
  ekipler,
  is,
  mevcutWorkerId,
  departmanlar,
  onAta,
  islemde = false,
  kaldirilabilir = false,
}: EkipSeciciProps) {
  const [secili, setSecili] = useState<string | null>(null);

  /** Atama gercekten degistiginde secim sifirlanir.
   *
   *  Secim `onAta` cagrilir cagrilmaz temizlenemez: istek ucarken yanit henuz
   *  gelmedigi icin `mevcutWorkerId` hala ESKI degeri tasir. "Ata -> havuza al
   *  -> tekrar ayni ekip" dizisinde bu, ekibi yeniden secen kullaniciya
   *  "Zaten atalı" yazan kilitli bir dugme gosteriyordu: kayit havuzdayken
   *  bilesen onu hala atali saniyordu. Sifirlamayi ATAMANIN KENDISINE baglamak
   *  bunu kokunden cozer - secim, gercek durum degistigi an ve yalnizca o an
   *  birakilir. */
  useEffect(() => {
    setSecili(null);
  }, [mevcutWorkerId]);

  /** Iki bolum: isin kendi mudurlugu (otomatik atamanin bakacagi tek grup) ve
   *  digerleri. Ikisinin icinde de siralama mesafeye gore. */
  const { oncelikli, digerleri } = useMemo(() => {
    const durumlar = (ekipler ?? []).map((e) => ekipDurumu(e, is, mevcutWorkerId));
    // Isin mudurlugu bilinmiyorsa ayirma yapilmaz: uydurma bir "oncelik"
    // gostermektense tek liste dogru olur.
    if (!is.departman) {
      return { oncelikli: durumlar.sort(mesafeyeGoreSirala), digerleri: [] };
    }
    return {
      oncelikli: durumlar
        .filter((d) => d.ekip.departman === is.departman)
        .sort(mesafeyeGoreSirala),
      digerleri: durumlar
        .filter((d) => d.ekip.departman !== is.departman)
        .sort(mesafeyeGoreSirala),
    };
  }, [ekipler, is, mevcutWorkerId]);

  const seciliDurum = [...oncelikli, ...digerleri].find(
    (d) => d.ekip.id === secili
  );
  const toplam = oncelikli.length + digerleri.length;

  /** "Zaten atalı" ancak islem YOKKEN iddia edilebilir: bir istek ucarken
   *  `mevcutWorkerId` hala eski degeri tasidigi icin, havuza yeni alinmis bir
   *  kayit atali gorunup dugmeyi bosuna kilitlerdi. Islem sirasinda dugme
   *  zaten "…" gosterip devre disi kaliyor, yani kaybedilen bir koruma yok. */
  const zatenAtali = Boolean(seciliDurum?.mevcut) && !islemde;

  if (toplam === 0) {
    return (
      <p className="border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-500">
        Atanabilecek saha ekibi yok.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="max-h-56 space-y-1 overflow-y-auto">
        {oncelikli.length > 0 && (
          <Bolum
            baslik={
              is.departman
                ? `${departmanAdi(departmanlar, is.departman)} · bu işin müdürlüğü`
                : "Saha ekipleri"
            }
            vurgulu
          />
        )}
        {oncelikli.map((d) => (
          <EkipSatiri
            key={d.ekip.id}
            durum={d}
            secili={secili === d.ekip.id}
            departmanlar={departmanlar}
            onSec={() => setSecili(d.ekip.id)}
          />
        ))}

        {digerleri.length > 0 && (
          <Bolum baslik="Diğer müdürlükler · otomatik atama buraya bakmaz" />
        )}
        {digerleri.map((d) => (
          <EkipSatiri
            key={d.ekip.id}
            durum={d}
            secili={secili === d.ekip.id}
            departmanlar={departmanlar}
            onSec={() => setSecili(d.ekip.id)}
          />
        ))}
      </div>

      {/* Secilen ekip kural disiysa gerekcesi acikca yazilir; secim yine de
          yapilabilir (elle atama kisitlardan muaftir). */}
      {seciliDurum && (seciliDurum.dolu || seciliDurum.karsiYaka || seciliDurum.baskaMudurluk) && (
        <ul className="space-y-1 border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
          {seciliDurum.dolu && (
            <li>
              <strong>Kuyruğu dolu:</strong> bu ekibin zaten{" "}
              {seciliDurum.ekip.aktif_gorev} aktif işi var (üst sınır{" "}
              {MAKS_AKTIF_GOREV}). Yine de atayabilirsiniz, ekip fazla yüklenir.
            </li>
          )}
          {seciliDurum.karsiYaka && (
            <li>
              <strong>Karşı yaka:</strong> ekip{" "}
              {yakaEtiketi(seciliDurum.ekip.yaka)}, iş {yakaEtiketi(is.yaka)}.
              Köprüden geçmesi gerekir; otomatik atama bunu yapmaz.
            </li>
          )}
          {seciliDurum.baskaMudurluk && (
            <li>
              <strong>Başka müdürlük:</strong> ekip{" "}
              {departmanAdi(departmanlar, seciliDurum.ekip.departman)}, iş ise{" "}
              {departmanAdi(departmanlar, is.departman)} kapsamında.
            </li>
          )}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (!secili) return;
            // Secim BURADA temizlenmez: yanit gelene kadar hangi ekibin
            // secildigi ekranda kalmali (islem suruyor), sifirlamayi
            // `mevcutWorkerId` degisimine bagli effect ustlenir.
            onAta(secili);
          }}
          disabled={!secili || islemde || zatenAtali}
          className="flex items-center gap-1.5 bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <IconCheck className="h-3.5 w-3.5" />
          {islemde ? "…" : zatenAtali ? "Zaten atalı" : "Ata"}
        </button>
        {kaldirilabilir && mevcutWorkerId && (
          <button
            type="button"
            onClick={() => onAta(null)}
            disabled={islemde}
            className="text-xs font-medium text-slate-500 underline-offset-2 transition hover:text-red-600 hover:underline disabled:text-slate-300"
          >
            Atamayı kaldır (havuza al)
          </button>
        )}
      </div>
    </div>
  );
}

function Bolum({ baslik, vurgulu }: { baslik: string; vurgulu?: boolean }) {
  return (
    <p
      className={`sticky top-0 z-10 bg-white px-1 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wider ${
        vurgulu ? "text-emerald-700" : "text-slate-400"
      }`}
    >
      {baslik}
    </p>
  );
}

/** Tek ekip satiri: ad + mesafe + yuk cubugu + uyari rozetleri. Radyo yerine
 *  buton: dokunma hedefi tum satir olsun. */
function EkipSatiri({
  durum,
  secili,
  departmanlar,
  onSec,
}: {
  durum: EkipDurumu;
  secili: boolean;
  departmanlar?: Departman[];
  onSec: () => void;
}) {
  const { ekip, mesafeM, dolu, karsiYaka, baskaMudurluk, mevcut } = durum;
  return (
    <button
      type="button"
      onClick={onSec}
      className={`flex w-full items-center gap-2 border px-2 py-1.5 text-left transition ${
        secili
          ? "border-emerald-500 bg-emerald-50"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      <IconUsers
        className={`h-3.5 w-3.5 shrink-0 ${dolu ? "text-amber-600" : "text-slate-400"}`}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-xs font-medium text-slate-800">
            {ekip.full_name || ekip.email}
          </span>
          {mevcut && (
            <span className="shrink-0 bg-indigo-100 px-1 text-[10px] font-medium text-indigo-700">
              şu an atalı
            </span>
          )}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] text-slate-500">
          {/* Mesafe ilk sirada: siralamanin gerekcesi gorunur olmali. */}
          <span className="font-medium tabular-nums text-slate-600">
            {mesafeM != null ? mesafeEtiketi(mesafeM) : "konum yok"}
          </span>
          <span aria-hidden>·</span>
          <span
            className={`tabular-nums ${dolu ? "font-semibold text-amber-700" : ""}`}
          >
            {ekip.aktif_gorev}/{MAKS_AKTIF_GOREV} iş
          </span>
          {ekip.yaka && (
            <>
              <span aria-hidden>·</span>
              <span>{YAKA_KISA[ekip.yaka as Yaka] ?? ekip.yaka}</span>
            </>
          )}
          {baskaMudurluk && (
            <span className="inline-flex items-center gap-0.5 bg-amber-100 px-1 font-medium text-amber-800">
              <IconWarning className="h-2.5 w-2.5" />
              {departmanAdi(departmanlar, ekip.departman)}
            </span>
          )}
          {karsiYaka && (
            <span className="inline-flex items-center gap-0.5 bg-amber-100 px-1 font-medium text-amber-800">
              <IconWarning className="h-2.5 w-2.5" />
              karşı yaka
            </span>
          )}
          {dolu && (
            <span className="inline-flex items-center gap-0.5 bg-amber-100 px-1 font-medium text-amber-800">
              <IconWarning className="h-2.5 w-2.5" />
              dolu
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
