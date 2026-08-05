import { describe, expect, it } from "vitest";

import { talep, varlik } from "../test/yardimcilar";
import { gorunumlereAyir, onayliEslemeKur } from "./useTalepGorunumleri";

/** Talep gorunumu turetmesi ve onayli talep <-> varlik eslemesi.
 *
 *  Ikisi de gecmiste bir kez gercekten bozulmustu: "Onaylandı" sekmesinde
 *  haritadan bir talep secmek panelde hicbir satiri vurgulamiyordu (ayri
 *  id'ler), ve acilista varlik sorgusu yuklenmeden siniflama yapilinca her sey
 *  bir an "Tamir Edildi"ye dusup geri ziplıyordu. */

describe("onayliEslemeKur", () => {
  it("iki yonlu eslemeyi kurar", () => {
    const v = varlik({ status: "bakim_lazim", source: "ihbar" });
    const r = talep({ status: "onaylandi", created_asset_id: v.properties.id });
    const { rapordanVarliga, varliktanRapora } = onayliEslemeKur([r]);
    expect(rapordanVarliga.get(r.properties.id)).toBe(v.properties.id);
    expect(varliktanRapora.get(v.properties.id)).toBe(r.properties.id);
  });

  it("varlik olusturmamis talebi atlar", () => {
    const r = talep({ status: "onaylandi", created_asset_id: null });
    const { rapordanVarliga, varliktanRapora } = onayliEslemeKur([r]);
    expect(rapordanVarliga.size).toBe(0);
    expect(varliktanRapora.size).toBe(0);
  });
});

describe("gorunumlereAyir", () => {
  const acikIs = varlik({ status: "bakim_lazim", source: "ihbar" });
  const tamirEdilmis = varlik({ status: "iyi", source: "ihbar" });
  const acikTalep = talep({
    status: "onaylandi",
    created_asset_id: acikIs.properties.id,
  });
  const tamirTalebi = talep({
    status: "onaylandi",
    created_asset_id: tamirEdilmis.properties.id,
  });
  const silinmisVarliginTalebi = talep({
    status: "onaylandi",
    created_asset_id: "00000000-0000-4000-8000-999999999999",
  });
  const bekleyen = talep({ status: "beklemede" });
  const reddedilen = talep({ status: "reddedildi" });

  const adlar = (liste: { properties: { id: string } }[]) =>
    liste.map((f) => f.properties.id);

  it("onaylanmislari varligin durumuna gore ikiye ayirir", () => {
    const g = gorunumlereAyir(
      {
        beklemede: [bekleyen],
        onaylandi: [acikTalep, tamirTalebi],
        reddedildi: [reddedilen],
      },
      [acikIs, tamirEdilmis]
    );
    expect(adlar(g.onaylandi)).toEqual([acikTalep.properties.id]);
    expect(adlar(g.tamir)).toEqual([tamirTalebi.properties.id]);
    expect(adlar(g.beklemede)).toEqual([bekleyen.properties.id]);
    expect(adlar(g.reddedildi)).toEqual([reddedilen.properties.id]);
  });

  it("varligi artik olmayan onayli talep 'tamir' sayilir", () => {
    // Tamir edilen varliklar TAMIR_SAKLAMA_GUN sonunda otomatik silinir; talep
    // kaydi kalir. "Varlik yok" = is bitmis demektir, acik is degil.
    const g = gorunumlereAyir(
      { beklemede: [], onaylandi: [silinmisVarliginTalebi], reddedildi: [] },
      [acikIs]
    );
    expect(adlar(g.tamir)).toEqual([silinmisVarliginTalebi.properties.id]);
    expect(g.onaylandi).toHaveLength(0);
  });

  it("varlik sorgusu YUKLENMEDEN siniflama yapmaz", () => {
    // Regresyon: undefined ile bos dizi ayni sayilirsa acilista her onayli
    // talep bir an "Tamir Edildi"ye duser, veri gelince geri ziplar.
    const g = gorunumlereAyir(
      { beklemede: [], onaylandi: [acikTalep, tamirTalebi], reddedildi: [] },
      undefined
    );
    expect(g.tamir).toHaveLength(0);
    expect(adlar(g.onaylandi)).toEqual([
      acikTalep.properties.id,
      tamirTalebi.properties.id,
    ]);
  });

  it("her kayda properties.gorunum yazar (harita pin rengi bunu okur)", () => {
    const g = gorunumlereAyir(
      { beklemede: [], onaylandi: [tamirTalebi], reddedildi: [] },
      [tamirEdilmis]
    );
    expect(g.tamir[0].properties.gorunum).toBe("tamir");
  });

  it("onayli talebin konumunu olusan varliktan alir", () => {
    // Regresyon: personel varligin enlem/boylamini duzeltince haritadaki talep
    // isaretcisi eski (vatandasin isaretledigi) noktada kaliyordu.
    const tasinmis = varlik({
      status: "bakim_lazim",
      source: "ihbar",
      koordinat: [29.5, 40.9],
    });
    const raporu = talep({
      status: "onaylandi",
      created_asset_id: tasinmis.properties.id,
      koordinat: [28.98, 41.01],
    });
    const g = gorunumlereAyir(
      { beklemede: [], onaylandi: [raporu], reddedildi: [] },
      [tasinmis]
    );
    expect(g.onaylandi[0].geometry.coordinates).toEqual([29.5, 40.9]);
    // Ham kayit degismez.
    expect(raporu.geometry.coordinates).toEqual([28.98, 41.01]);
  });

  it("varligi bilinmeyen talebin kendi konumunu korur", () => {
    const g = gorunumlereAyir(
      { beklemede: [bekleyen], onaylandi: [], reddedildi: [] },
      [acikIs]
    );
    expect(g.beklemede[0].geometry.coordinates).toEqual(
      bekleyen.geometry.coordinates
    );
  });

  it("kaynak nesneleri DEGISTIRMEZ (kopya uzerine yazar)", () => {
    gorunumlereAyir(
      { beklemede: [], onaylandi: [tamirTalebi], reddedildi: [] },
      [tamirEdilmis]
    );
    expect(tamirTalebi.properties.gorunum).toBeUndefined();
  });

  it("henuz cekilmemis durumlari (undefined) sessizce atlar", () => {
    const g = gorunumlereAyir(
      { beklemede: undefined, onaylandi: undefined, reddedildi: undefined },
      []
    );
    expect(g.beklemede).toHaveLength(0);
    expect(g.onaylandi).toHaveLength(0);
  });
});
