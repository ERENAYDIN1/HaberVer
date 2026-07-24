# Kaynak

## İstanbul (il 34 + ilçe + mahalle) — OpenStreetMap

Projenin **fiilen kullandığı** İstanbul sınırları (`il/34.json`, `ilce/34*.json`,
`mahalle/`, `mahalleler.json`) doğrudan **OpenStreetMap**'ten üretilir:

- Kaynak: OpenStreetMap (Overpass API). Lisans: **ODbL 1.0** — _"Data © OpenStreetMap contributors, ODbL 1.0. https://osm.org/copyright"_
- Üretim betiği: `backend/scripts/istanbul_sinirlari_osm.py` (+ `osm_lib.py`)
- OSM idari-seviye şeması (Türkiye büyükşehir): **il = admin_level 4, ilçe = 6, mahalle = 8** (mahalle 10 _değil_ — İstanbul büyükşehir yapısında mahalleler admin_level 8'dir).
- İl `223474` relation'ı; ilçeler İstanbul alanı içindeki admin_level 6 relation'ları; her ilçenin mahalleleri o ilçenin alanı içindeki admin_level 8 relation'ları olarak, **OSM'in kendi idari hiyerarşisinden** çekilir (önceki sürümdeki "mahalleyi mekansal tahminle ilçeye bağlama" yaklaşımı kaldırıldı).

**Neden OSM'e geçildi:** Önceki İstanbul il/ilçe verisi (aşağıdaki HDX kaynağı)
insani-yardım amaçlı, genelleştirilmiş bir veri setiydi ve şehir ölçeğinde çok
kabaydı — bir ilçenin tamamı 50–120 noktayla temsil ediliyor, sınır çizgileri
altlık haritadan görünür şekilde kayıyordu. OSM aynı ilçeleri 700–4000 noktayla,
gerçek sınır hattıyla verir. Proje zaten OSM/Nominatim kullandığından lisans
açısından da tutarlıdır.

- İlçe kodları (`34001`…`34039`) mevcut şemayla **aynı** tutulur: OSM ilçe adı
  mevcut `ilceler.json` adıyla eşleştirilerek kod korunur; böylece mahalle kodu
  şeması (`<ilceKodu><3 hane>`, örn. `34023005`) ve tüm referanslar bozulmaz.
- İl sınırı **tek poligondur** (Boğaz'ın suyu dahil — gerçek idari sınır böyle);
  önceki HDX verisi şehri Boğaz'da ~9 kara parçasına bölüyordu. Halkalar maske
  tekniği için CW sarıma çevrilir (bkz. `frontend/src/utils/istanbulMaskesi.ts`).
- Kapsam ~964 mahalle (İstanbul'un resmî mahalle sayısıyla neredeyse birebir).

## Diğer 80 il + 973 ilçe — HDX COD-AB-TUR (yedek/genel)

Türkiye genelindeki il/ilçe verisi (`il/<plaka>.json`, `ilce/<kod>.json` —
İstanbul dışındakiler —, `iller.json`, `ilceler.json`) şu kaynaktan türetilir:

- Repo: https://github.com/ttezer/turkiye-harita-verisi (`dist/geojson`, `dist/csv`)
- Asıl veri: [HDX COD-AB-TUR](https://data.humdata.org/dataset/cod-ab-tur) (OCHA/HDX), lisans ailesi `CC BY-IGO`
- Üretim betiği: `backend/scripts/sinirlari_hazirla.py`

Frontend yalnızca İstanbul'u kullandığından bu genel veri pratikte backend'in
genel amaçlı `/api/sinirlar/iller|il/{kod}` uçlarını besler; İstanbul'un il/ilçe
dosyaları yukarıdaki OSM betiğiyle **üzerine yazılır**.

## Yapılan işlem (ortak)

Her iki betikte de sınır çizgileri Douglas-Peucker ile sadeleştirilir, koordinatlar
5 ondalığa (~1m) yuvarlanır ve her parça (ada / boğazla ayrılmış kara / göl)
korunur. Sadeleştirme toleransı OSM betiğinde daha ince tutulur (il ~33m, ilçe
~16m, mahalle ~11m); HDX betiğinde ~65m. Bu, şehir ölçeğinde görselleştirme ve
varlık filtreleme için yeterli bir yaklaştırmadır; resmî/hukuki sınır tespiti
için kullanılmamalıdır.
