import { useEffect, useRef, useState } from "react";

/** Ekibin listesindeki bir DEGISIKLIGIN ekranda duyurulmasi icin gereken en az
 *  bilgi. Iki yon de duyurulur (bkz. `yon`): bir isin geri alinmasi ekip icin
 *  en az atanmasi kadar onemlidir - ekip artik gitmeyecegi bir adrese
 *  gitmemeli. */
export interface YeniGorevBildirimi {
  /** Kaydin kendi kimligi (assignment_id ya da bolge id); tekrar duyurulmasin. */
  id: string;
  ad: string;
  /** Rozet metni: "bakım", "görev bölgesi", "güzergâh". */
  tur: string;
  /** "atandi" listeye girdi, "kaldirildi" listeden dustu. */
  yon: "atandi" | "kaldirildi";
}

/** Bir listedeki kayitlari kimlik+ad+tur uclusune indirger. `yon` cagiran
 *  tarafta bilinmez, hook'un kendisi doldurur. */
type Cikarim<T> = (kayit: T) => Omit<YeniGorevBildirimi, "yon">;

/** Ekibin is listesindeki DEGISIKLIKLERI tespit eder ve bildirim dondurur.
 *
 *  Ekip ekrani sorgulari periyodik olarak tazeliyor, ama tazelenen liste
 *  sessizce degisiyordu: yeni is listenin bir yerine giriyor, geri alinan is
 *  listeden kayboluyor, ekip ikisini de fark etmiyordu. Burada iki cekim
 *  arasindaki FARK alinir ve iki yon de duyurulur.
 *
 *  KALDIRMA DA DUYURULUR: personel bir isi baska ekibe tasidiginda ya da
 *  havuza aldiginda kayit ekibin listesinden sessizce dusuyordu. Ekibin yola
 *  cikmis olabilecegi bir is icin bu, atama kadar onemli bir olaydir.
 *
 *  ILK CEKIM DUYURULMAZ: ekran acildiginda ekibin uzerindeki her is "yeni"
 *  sayilsaydi, her giriste liste boyu bir bildirim yigini cikardi. Ilk yanit
 *  yalnizca baslangic kumesini kurar (`gorulenlerRef`).
 *
 *  Kaybolan kayitlar kumeden dusurulur: bir is geri alinip tekrar atanirsa
 *  yeniden duyurulmali - ekip icin bu gercekten yeni bir olaydir. */
export function useYeniGorevler<T>(
  kayitlar: T[] | undefined,
  cikar: Cikarim<T>
): {
  yeniler: YeniGorevBildirimi[];
  temizle: () => void;
  /** Kullanicinin KENDI islemiyle listeye giren ya da listeden cikan kaydi
   *  duyurudan muaf tutar ("Geri Al" isi listeye koyar, "Tamamlandi" listeden
   *  cikarir). Ekibin kendi tikladigi seyi ona haber vermek yanlis olurdu ve
   *  zaten kendi islem seridinde yaziyor. Muafiyet tek seferliktir. */
  kendiIslemi: (id: string) => void;
} {
  /** Bir onceki cekimde gorulen kayitlar, id -> bildirim. Yalnizca id kumesi
   *  yetmez: listeden DUSEN bir kaydin adi artik gelen veride yok, duyuruyu
   *  adiyla yazabilmek icin son gorulen hali saklanir. */
  const gorulenlerRef = useRef<Map<string, YeniGorevBildirimi> | null>(null);
  /** Kullanicinin kendi islemiyle listeye girecek/cikacak kayitlar; ilk farkta
   *  duyurulmadan yutulur. */
  const muaflarRef = useRef<Set<string>>(new Set());
  const [yeniler, setYeniler] = useState<YeniGorevBildirimi[]>([]);
  // `cikar` cagiran tarafta her render'da yeniden olusabilir; effect'i ona
  // baglamak her render'da fark hesaplatirdi.
  const cikarRef = useRef(cikar);
  cikarRef.current = cikar;

  useEffect(() => {
    if (!kayitlar) return;
    const guncel = new Map<string, YeniGorevBildirimi>();
    for (const k of kayitlar) {
      const b = cikarRef.current(k);
      guncel.set(b.id, { ...b, yon: "atandi" });
    }

    // Ilk yanit: yalnizca baslangic kumesi kurulur, hicbir sey duyurulmaz.
    if (gorulenlerRef.current === null) {
      gorulenlerRef.current = guncel;
      return;
    }

    const gorulenler = gorulenlerRef.current;
    /** Kullanicinin kendi islemiyle olusan degisiklik bir kez yutulur ve
     *  muafiyet TUKETILIR - ayni is ileride gercekten degisirse duyurulmali. */
    const muaf = (id: string) => muaflarRef.current.delete(id);

    const eklenenler = [...guncel.values()].filter(
      (b) => !gorulenler.has(b.id) && !muaf(b.id)
    );
    // Listeden dusenler: son gorulen hallerinden okunur (adlari artik gelen
    // veride yok). Ayni tazelemede bir is dusup baskasi girebilir; ikisi de
    // ayri duyurulur.
    const dusenler = [...gorulenler.values()]
      .filter((b) => !guncel.has(b.id) && !muaf(b.id))
      .map((b): YeniGorevBildirimi => ({ ...b, yon: "kaldirildi" }));

    gorulenlerRef.current = guncel;
    if (eklenenler.length === 0 && dusenler.length === 0) return;
    // Birikmis bildirimlerin ustune eklenir: iki tazeleme arasinda okunmamis
    // bir duyuru varsa ikincisi onu silmemeli.
    setYeniler((oncekiler) => [...oncekiler, ...dusenler, ...eklenenler]);
  }, [kayitlar]);

  return {
    yeniler,
    temizle: () => setYeniler([]),
    kendiIslemi: (id: string) => {
      muaflarRef.current.add(id);
    },
  };
}
