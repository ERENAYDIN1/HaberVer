# Kaynak

## İl / ilçe sınırları

Bu dizindeki **il/ilçe** sınır verisi (`il/`, `ilce/`, `iller.json`, `ilceler.json`) şu kaynaktan türetilmiştir:

- Repo: https://github.com/ttezer/turkiye-harita-verisi (`dist/geojson`, `dist/csv`)
- Asıl veri: [HDX COD-AB-TUR](https://data.humdata.org/dataset/cod-ab-tur) (OCHA/HDX), lisans ailesi `CC BY-IGO`

## Mahalle sınırları (yalnızca İstanbul)

**Mahalle** sınır verisi (`mahalle/`, `mahalleler.json`) şu kaynaktan türetilmiştir:

- Repo: https://github.com/sahircansurmeli/istanbul-geojson (`mahalle_geojson.json`)
- Asıl veri: **OpenStreetMap** (Nominatim `lookup` ile İstanbul ilçelerinin alt alanları). Lisans: **ODbL 1.0** — _"Data © OpenStreetMap contributors, ODbL 1.0. https://osm.org/copyright"_

Proje zaten OSM/Nominatim (konum arama) kullandığından bu kaynak lisans açısından tutarlıdır. Üretim betiği: `backend/scripts/mahalleleri_hazirla.py`.

- Her mahallenin hangi ilçeye ait olduğu, mahalle adı/`display_name` güvenilmez olduğundan **mekansal olarak** bulunur: mahallenin temsili noktası (en geniş parçasının merkezi) hangi İstanbul ilçe sınırının içine düşüyorsa o ilçeye (`ilceKodu`) bağlanır; sınıra/suya taşan birkaç kıyı/ada mahallesi için "en yakın ilçe" yedeği kullanılır.
- Mahalle kodu: `<ilceKodu><3 haneli sıra>` (örn. `34023004` = Kadıköy'ün 4. mahallesi), ilçe içinde ada göre sıralanıp numaralanır.
- Kapsam ~968 mahalle (İstanbul'un resmî mahalle sayısıyla neredeyse birebir).

## Yapılan işlem

`backend/scripts/sinirlari_hazirla.py` betiği ile:

- Her il/ilçe için TÜM polygon bileşenlerinin (parçaların) dış halkası korunmuştur — adalar ve boğazla ayrılmış kara parçaları (İstanbul, Çanakkale) dahil, hiçbir parça atlanmaz. Bir bileşenin varsa iç halkaları (delikler) göz ardı edilir (kaynak veride bulunmuyor).
- Sınır çizgileri Douglas-Peucker algoritmasıyla (~65m tolerans) sadeleştirilmiştir.
- Koordinatlar 5 ondalığa yuvarlanmıştır (~1m hassasiyet).

Bu, şehir ölçeğinde görselleştirme ve varlık filtreleme için yeterli bir yaklaştırmadır; resmî/hukuki sınır tespiti için kullanılmamalıdır.
