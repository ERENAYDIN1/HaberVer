# Kaynak

Bu dizindeki il/ilçe sınır verisi şu kaynaktan türetilmiştir:

- Repo: https://github.com/ttezer/turkiye-harita-verisi (`dist/geojson`, `dist/csv`)
- Asıl veri: [HDX COD-AB-TUR](https://data.humdata.org/dataset/cod-ab-tur) (OCHA/HDX), lisans ailesi `CC BY-IGO`

## Yapılan işlem

`backend/scripts/sinirlari_hazirla.py` betiği ile:

- Her il/ilçe için TÜM polygon bileşenlerinin (parçaların) dış halkası korunmuştur — adalar ve boğazla ayrılmış kara parçaları (İstanbul, Çanakkale) dahil, hiçbir parça atlanmaz. Bir bileşenin varsa iç halkaları (delikler) göz ardı edilir (kaynak veride bulunmuyor).
- Sınır çizgileri Douglas-Peucker algoritmasıyla (~65m tolerans) sadeleştirilmiştir.
- Koordinatlar 5 ondalığa yuvarlanmıştır (~1m hassasiyet).

Bu, şehir ölçeğinde görselleştirme ve varlık filtreleme için yeterli bir yaklaştırmadır; resmî/hukuki sınır tespiti için kullanılmamalıdır.
