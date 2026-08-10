<div align="center">

<img src="frontend/public/logo.svg" alt="haber ver" width="110" height="110">

# haber ver+

**Akıllı Şehir Varlık Yönetimi**

</div>

Belediyenin şehirdeki ağaçlarını, park mobilyalarını, aydınlatma direklerini ve yol/altyapı
unsurlarını harita üzerinden takip eden; vatandaşın fotoğraflı ihbar gönderdiği, onaylanan
ihbarın envantere düşüp konuma en yakın saha ekibine otomatik atandığı web uygulaması.
FastAPI + React (Vite) + PostgreSQL/PostGIS + MapLibre; kimlik doğrulama Keycloak (OIDC)
üzerinde; Docker Compose ile paketli. Kapsam **İstanbul** ile sınırlıdır.

## Gereksinimler

- **Docker** ve **Docker Compose** (tek gereksinim — Python/Node/PostgreSQL host'a kurulmaz,
  hepsi konteynerde çalışır).
- Boşta olması gereken portlar: **5173** (uygulama), **8000** (API), **8081** (Keycloak),
  **5432** (PostgreSQL). Hepsi `.env`'den değiştirilebilir.

## Kurulum

```bash
# 1) Projeyi klonla ve içine gir
git clone <repo-url>
cd haberver

# 2) Ortam dosyasını hazırla
cp .env.example .env        # Windows PowerShell: copy .env.example .env

# 3) Tüm servisleri ayağa kaldır (ilk açılışta imajlar indirilir + build edilir, birkaç dakika)
docker compose up -d
```

`.env`'de **üç değerin doldurulması zorunludur** — varsayılanları yoktur, boş bırakılırsa
uygulama sessizce zayıf bir parolayla değil, açılışta hatayla durur:

| Değişken | Ne için |
|----------|---------|
| `DEFAULT_ADMIN_PASSWORD` | Uygulamanın ilk admin hesabının parolası (min. 8 karakter) |
| `KEYCLOAK_ADMIN_PASSWORD` | Keycloak **yönetim konsolu** parolası (uygulama admin'i değil) |
| `KEYCLOAK_CLIENT_SECRET` | Backend ↔ Keycloak istemci sırrı (`keycloak/realm-haberver.json` ile aynı olmalı) |

İlk açılışta otomatik olarak: şema migration'ları uygulanır, İstanbul yaka/sınır verisi
üretilir, ilk admin Keycloak'ta açılır. Sonuç **üretim şeklinde boş bir sistem**: yalnızca
admin + sınır verisi, sıfır varlık/ihbar. Sistemi dolu görmek için demo veriyi yükleyin:

```bash
docker compose exec backend python scripts/seed_demo.py    # --temizle / --sil bayrakları var
```

Bu komut 5 demo hesap, 27 varlık, 18 bekleyen ihbar ve 2 atama oluşturur. **Yalnızca
geliştirme içindir**, parolalar `seed_demo.py` içinde açıktır:

| Kullanıcı | Şifre | Rol |
|-----------|-------|-----|
| `admin@haberver.com` | `.env` → `DEFAULT_ADMIN_PASSWORD` | admin (tam yetki) |
| `calisan1@haberver.com` | `calisan1234` | calisan (varlık + ihbar onayı) |
| `sahaekibi1..3@haberver.com` | `saha1234` | saha_calisani (kendi işleri) |
| `vatandas1@haberver.com` | `vatandas1234` | vatandas (ihbar gönderir) |

Durdurmak için: `docker compose down` (verileri korur) · sıfırlamak için: `docker compose down -v`
(**DB'yi, yüklenen ihbar fotoğraflarını ve Keycloak kullanıcılarını siler**).

| Servis | Adres |
|--------|-------|
| Uygulama | http://localhost:5173/ |
| API dokümanı (Swagger) | http://localhost:8000/docs |
| Keycloak Admin Console | http://localhost:8081/ |

> Uygulamayı **mutlaka 5173 üzerinden** açın: oturum cookie'sinin first-party kalması için
> frontend, `/api` ve `/media` aynı origin'den servis edilir (dev'de Vite proxy'si yapar).

### Denemek için önerilen akış

1. `vatandas1` ile girin → haritaya tıklayıp fotoğraflı bir ihbar gönderin.
2. `calisan1` ile girin → **İhbarlar** sekmesinden onaylayın. Envanterde "bakım lazım" bir
   varlık oluşur ve konuma en yakın uygun saha ekibine otomatik atanır.
3. `sahaekibi1` ile girin → iş listenizde görün, **Tamir Edildi** ile kapatın.
4. `calisan1`'e dönün → ihbar artık **Tamir Edildi** görünümünde.

Giriş PayTrack'teki gibi **Keycloak'ın barındırdığı sayfada** yapılır; vatandaşlar oradan
kendileri kaydolur, personel/admin hesaplarını ise yalnızca admin **Personel** sekmesinden açar.

## Ne yapabiliyor?

- **Harita** — MapLibre, 5 stil (Hibrit/Uydu/OSM/Liberty/Voyager). Harita İstanbul'a
  kilitli, il sınırı dışı maskeli. İlçe → mahalle kademeli filtre (39 ilçe, ~964 mahalle,
  OSM sınır verisi). Nominatim ile konum arama.
- **Varlıklar** — 13 tür / 5 grup; fotoğraf, marka-model, kurulum tarihi. Haritada
  **şekil = sınıf, renk = anlam**: kayıtlı varlık daire, ihbar pin; bakım gerektiren amber halo.
  CSV/JSON dışa aktarma.
- **Çizim & ölçüm** — çok noktalı alan çizimi, canlı m²/ha/km², mesafe ölçümü. Üst üste binen
  alanlar toplamda iki kez sayılmaz (PostGIS ile çakışmasız ölçüm). Alana düşen varlıklar
  `ST_Within` ile sorgulanır.
- **İhbar akışı** — konum + tür + açıklama + zorunlu fotoğraf → `beklemede` kuyruğu →
  personel onayı → envantere "bakım lazım" varlık. Reddetme, reddi geri alma, onayda tür
  düzeltme. Dört görünüm: Bekleyen · Onaylandı · Tamir Edildi · Reddedildi.
- **Otomatik iş dağıtımı** — ekipler konumlarını ~30 sn'de bir bildirir. İş; **aynı yakadaki**
  (Boğaz'ın karşısına atama yapılmaz — kuş uçuşu 1,5 km, araçla 15 km), **kapasitesi olan**
  (max 3 aktif iş) en yakın ekibe düşer. Mesafe **kademelidir: önce ≤5 km, o halkada boş ekip
  yoksa ≤10 km**. Konumu hiç bilinmeyen ekip değerlendirmeye girmez (ilçe adı tek başına
  mesafe bilgisi vermez). Koşul sağlanmazsa havuzda bekler, bir iş bitince veya ekip
  yaklaşınca yeniden dağıtılır. Personel elle de atayabilir (o zaman kısıt uygulanmaz).
- **Görev bölgeleri & güzergâhlar** — çizilen alan/hat kaydedilip ekibe atanır; şekiller
  harita üzerinde düzenlenebilir (köşe sürükle/ekle/sil, jeodezik genişlet-daralt).
- **Dashboard** — toplam/bakım bekleyen sayıları, tür grubuna göre dağılım; harita, liste ve
  grafik aynı filtre durumunu paylaşır.
- **Güvenlik** — BFF deseni: access/refresh token'lar tarayıcıya hiç gitmez, backend'de
  durur; tarayıcı yalnızca httpOnly oturum cookie'si görür. CSRF (SameSite + Origin kontrolü),
  kimlik doğrulamalı medya servisi, hesap devre dışı bırakma (açık oturumlar anında düşer).

## Servisler

- **db** — PostgreSQL 16 + PostGIS 3.4 (varlıklar, geometriler, yaka alanları)
- **backend** — FastAPI, `:8000`
- **frontend** — React + Vite dev server, `:5173` (`/api` ve `/media`'yı backend'e proxy'ler)
- **keycloak** — Kimlik/rol yönetimi (OIDC), `:8081`, gömülü H2 ile

## Sık kullanılan komutlar

```bash
docker compose exec backend python scripts/auth_akis_testi.py      # uçtan uca OIDC akışı + rol ayrımı
docker compose exec backend python scripts/guvenlik_testi.py       # saldırı yolları kapalı mı
docker compose exec backend python scripts/hesap_kapatma_testi.py  # hesap devre dışı bırakma
docker compose exec backend python scripts/performans_testi.py     # SQL sorgu sayısı ölçer
docker compose exec backend alembic upgrade head                   # migration uygula
docker compose exec frontend npm test                              # frontend testleri
```

## Bilinmesi gerekenler

- **`KEYCLOAK_ADMIN_PASSWORD` yalnızca ilk açılışta okunur.** `kcdata` volume'ü oluştuktan
  sonra parola Keycloak'ın veritabanında yaşar, `.env` yok sayılır. Değiştirmek için:
  konsol → sağ üst kullanıcı menüsü → *Manage account → Account security → Signing in*.
- **`.env`'i değiştirmek mevcut hesabın parolasını sıfırlamaz.** `DEFAULT_ADMIN_PASSWORD`
  yalnızca sıfırdan kurulumu etkiler; mevcut admin için parolayı Keycloak konsolundan sıfırlayın.
- **Konsol yöneticisi ≠ uygulama admin'i.** `KEYCLOAK_ADMIN` master realm'dedir ve yalnızca
  yönetim arayüzü içindir; `admin@haberver.com` ise `haberver` realm'indeki uygulama admin'idir.
- **Realm ayarları yalnızca realm yokken import edilir.** Değişiklik için ya konsoldan elle
  uygulayın ya `docker volume rm haberver_kcdata` (tüm Keycloak kullanıcıları gider, Postgres
  verisi kalır). Realm JSON'unda yorum satırı olmaz, import'u kırar.

## Production

Bu kurulum geliştirme içindir. Canlıya çıkmadan önce:

- `SESSION_COOKIE_SECURE=true` + HTTPS; `KEYCLOAK_CLIENT_SECRET`'i hem `.env`'de hem realm
  JSON'unda değiştirin; `POSTGRES_PASSWORD` (ve `DATABASE_URL` içindeki şifre — senkron olmalı).
- Keycloak'ı `start-dev` yerine `start` + kalıcı DB ile çalıştırın; self-registration'da
  **e-posta doğrulamasını açın** (kapalıysa sahte hesap/ihbar akını gelir).
- Frontend + `/api` + `/media`'yı **tek origin'den** servis eden gerçek bir reverse proxy
  (nginx) kurun — aksi halde cookie cross-site olur ve giriş çalışmaz. Backend/Postgres
  portlarını dışarı yayınlamayın, `seed_demo.py`'yi çalıştırmayın.
- **Harita altlığı:** "Uydu" ve "Hibrit" stilleri Google'ın dokümante edilmemiş raster tile
  ucunu kullanır — resmi değildir, kullanım şartlarına aykırıdır, her an engellenebilir.
  API anahtarı gerektirmediği için dev'de bilinçli tercih edildi; production'da MapTiler veya
  Google Maps JS API'ye geçin. Diğer üç stil Google'dan bağımsızdır.

## Lisans ve atıf

Kod **MIT** lisanslıdır (bkz. [`LICENSE`](LICENSE)). Repodaki **sınır verisi bu kapsamda
değildir** — türetildiği kaynakların lisansına tabidir ve atıf zorunludur:

- İstanbul il/ilçe/mahalle sınırları OpenStreetMap'ten (Overpass) üretilmiştir:
  **Data © OpenStreetMap contributors, ODbL 1.0 — https://osm.org/copyright**
- Diğer 80 il / 973 ilçe sınırı: HDX `COD-AB-TUR`
  ([ttezer/turkiye-harita-verisi](https://github.com/ttezer/turkiye-harita-verisi)), **CC BY-IGO**.
- Konum arama: OpenStreetMap Nominatim.
