import { useEffect, useState } from "react";

/** Arama + siralamayi tek yerde tutan hook: uc panel de (varlik, talep,
 *  bolge/guzergah) ayni state ikilisini kuruyordu.
 *
 *  Hesaplar `utils/listeAraci.ts`'te, cubugun kendisi
 *  `components/ListeAraciCubugu.tsx`'te.
 *
 *  ## Neden `kapsam` var
 *
 *  Bir panel birden fazla listeyi gosterebiliyor (Bölgeler/Güzergâhlar
 *  sekmeleri, talep panelinin dort alt-sekmesi). Bu durumda arama ile
 *  siralamanin sekme degisiminde davranisi AYNI OLMAMALI:
 *
 *  - **Arama sifirlanir.** Gecici bir daraltmadir ve listeyi GIZLER: sekmeye
 *    donunce asili kalmis bir arama metni listeyi sessizce bos gosterir,
 *    kullanici "kayit yok" saniyordu.
 *  - **Siralama sekme basina HATIRLANIR.** Siralama hicbir sey gizlemez,
 *    yalnizca dizer - hatirlanmasi risksizdir. Ustelik her sekmenin dogal
 *    sirasi farkli olabilir (Bölgeler'de "Ada göre", Güzergâhlar'da "Önce
 *    atanmamış" istenebilir).
 *
 *  Bu ayrim `key={sekme}` ile bileseni bastan kurarak COZULEMEZ: o yontem
 *  ikisini birden sifirlar, yani siralama secimini de her sekme degisiminde
 *  unutur. Bu yuzden durum burada, kapsam anahtariyla bolunmus olarak yasar.
 *
 *  Kalicilik bilincli olarak YOK (localStorage'a yazilmaz): filtre bir
 *  calisma durumudur, tercih degil. Sayfa yenilenince varsayilana doner -
 *  projedeki localStorage kullanimi (favori renkler, panel acik/kapali)
 *  gercek tercihler icindir.
 *
 *  @param varsayilanSira Siralama acilirinin baslangic degeri.
 *  @param kapsam Panelin o an gosterdigi liste (orn. "alan" / "cizgi").
 *                Verilmezse tek listeli panel varsayilir.
 */
export function useListeAraci(varsayilanSira: string, kapsam = "") {
  // Arama metni HANGI KAPSAMDA yazildigiyla birlikte tutulur. Kapsam degisince
  // ayrica bir sifirlama adimi yok: metin yalnizca yazildigi kapsamda okunur,
  // digerlerinde bos gorunur. Boylece "kapsam degisti mi" karsilastirmasi
  // (ref + render sirasinda setState) hic gerekmiyor ve yeni sekme ilk
  // karesinde dogru - suzulmemis - listeyi cizer.
  const [aramaDurumu, setAramaDurumu] = useState({ kapsam, metin: "" });
  // Kapsam -> secilen siralama. Ziyaret edilmemis kapsam varsayilanina duser.
  const [siralar, setSiralar] = useState<Record<string, string>>({});

  return {
    arama: aramaDurumu.kapsam === kapsam ? aramaDurumu.metin : "",
    setArama: (v: string) => setAramaDurumu({ kapsam, metin: v }),
    sira: siralar[kapsam] ?? varsayilanSira,
    setSira: (v: string) => setSiralar((s) => ({ ...s, [kapsam]: v })),
  };
}

/** Panel sekmesi/filtresi degisince aramayi sifirlar. Sekme degistiginde eski
 *  aramanin yeni listede asili kalmasi "bu sekme bos" izlenimi veriyordu.
 *
 *  `useListeAraci`'nin `kapsam` parametresi bunu zaten yapar; bu hook yalnizca
 *  aramayi kapsam disinda bir seye (orn. bir filtre degisimine) baglamak
 *  gerektiginde kullanilir. */
export function useAramaSifirla(
  setArama: (v: string) => void,
  ...bagimliliklar: unknown[]
) {
  useEffect(() => {
    setArama("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, bagimliliklar);
}
