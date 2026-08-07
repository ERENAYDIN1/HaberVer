import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import olaylar
from ..crud import asset as asset_crud
from ..crud import assignment as crud
from ..crud import yaka as yaka_crud
from ..database import get_db
from ..models.asset import AssetStatus
from ..models.user import User, UserRole
from ..schemas.saha import (
    AktifGorevBilgi,
    AtamaGirdi,
    BolgeGorevOzet,
    EkipGorevleri,
    EkipOzet,
    GorevDurumu,
    GorevFeatureCollection,
    GorevOzet,
    GorevRef,
    HavuzVarlik,
    KonumGuncelle,
    TamamlananOzet,
    VarlikRef,
)
from ..security import Kapsam, kapsam, personel, require_role

router = APIRouter(prefix="/api/saha", tags=["saha"])


# Havuz dagitimini tetiklemek icin gereken en kucuk yer degistirme (metre).
# Konum ~30 sn'de bir bildirildigi icin her ping'te dagitim yapmak, ekip
# yerinde dursa bile havuzdaki her is icin ayri sorgu demekti. Bu esigin
# altindaki hareket, kilometrelerle olculen menzil kademelerinde sonucu
# degistiremez.
KONUM_DAGITIM_ESIGI_M = 250


def _atama_degisti() -> None:
    """Gorev dagilimi degisti: hem panolar hem saha ekranlari tazelensin.

    HEDEF DARALTILMAZ (tum personel + tum saha ekipleri): bir atama en az iki
    ekibi birden ilgilendirir (isi alan ve - devirse - isi kaybeden), ustelik
    otomatik dagitim tek islemde birden fazla ekibin kuyrugunu degistirebilir
    (bkz. bekleyen_gorevleri_dagit). Kimin etkilendigini burada tek tek
    hesaplamak, sinyalin kendisi veri tasimadigi icin kazanci olmayan bir
    karmasiklik olurdu - istemci zaten KENDI kapsamindaki ucu cagiriyor.

    `bolgeler` de yayinlanir: bolge/guzergah ayni kotayi paylasir, bir tekil
    isin atanmasi bekleyen bir bolgenin dagitilmasini tetikleyebilir."""
    olaylar.yayinla("saha")
    olaylar.yayinla("bolgeler")


@router.post("/konum", status_code=status.HTTP_204_NO_CONTENT)
def konum_guncelle(
    data: KonumGuncelle,
    user: User = Depends(require_role(UserRole.saha_calisani)),
    db: Session = Depends(get_db),
):
    """Saha calisaninin son konumunu gunceller (tarayici geolocation'i periyodik
    olarak cagirir)."""
    yeni_konum = func.ST_SetSRID(
        func.ST_MakePoint(data.longitude, data.latitude), 4326
    )

    # Ekip yeni konumuyla havuzdaki bir isin menziline girmis olabilir, ama bu
    # ancak kayda deger bir yer degistirmede mumkun. Ilk konum bildiriminde her
    # zaman dagitilir: ekip o ana kadar atama icin uygun degildi.
    if user.last_location is None:
        dagit = True
    else:
        mesafe = db.execute(
            select(func.ST_DistanceSphere(User.last_location, yeni_konum)).where(
                User.id == user.id
            )
        ).scalar_one()
        dagit = mesafe is not None and mesafe >= KONUM_DAGITIM_ESIGI_M

    user.last_location = yeni_konum
    user.last_seen_at = datetime.now(timezone.utc)
    if dagit:
        crud.bekleyen_gorevleri_dagit(db)
    db.commit()
    # Sinyal YALNIZCA dagitim yapildiginda: konum ping'i ekip basina 30 sn'de
    # bir geliyor, her birinde yayin yapmak yoklamanin yerine ondan daha
    # gurultulu bir sey koymak olurdu. Ekip pininin haritada birkac saniye
    # gecikmeli kaymasi kabul edilir; is dagilimi degistiginde ise gecikme
    # kabul edilmez.
    if dagit:
        _atama_degisti()


@router.get("/gorevlerim", response_model=GorevFeatureCollection)
def gorevlerim(
    user: User = Depends(require_role(UserRole.saha_calisani)),
    db: Session = Depends(get_db),
):
    """Giris yapan saha ekibinin aktif gorevleri (kendisine atanan varliklar)."""
    return GorevFeatureCollection.from_rows(crud.gorevlerim(db, user.id))


@router.get("/tamamlananlarim", response_model=GorevFeatureCollection)
def tamamlananlarim(
    user: User = Depends(require_role(UserRole.saha_calisani)),
    db: Session = Depends(get_db),
):
    """Giris yapan saha ekibinin yakinda tamamladigi gorevler ('Tamamlanan
    İşler'). Yanlislikla tamamlanan bir is buradan geri alinabilir."""
    return GorevFeatureCollection.from_rows(crud.tamamlananlarim(db, user.id))


@router.post("/tamamlanan-geri-al", status_code=status.HTTP_204_NO_CONTENT)
def tamamlanan_geri_al(
    data: GorevRef,
    user: User = Depends(require_role(UserRole.saha_calisani)),
    db: Session = Depends(get_db),
):
    """Saha ekibi yanlislikla tamamladigi bir gorevi geri alir (varlik yeniden
    'bakim_lazim', gorev yeniden 'atandi'). Kapasite dolu olsa bile izin verilir."""
    asset = crud.tamamlanani_geri_al(db, data.assignment_id, user.id)
    if asset is None:
        raise HTTPException(
            status_code=404,
            detail="Geri alinabilecek tamamlanmis gorev bulunamadi",
        )
    db.commit()
    _atama_degisti()


@router.get("/ekipler", response_model=list[EkipOzet])
def ekipler(
    _: User = Depends(personel),
    alan: Kapsam = Depends(kapsam),
    db: Session = Depends(get_db),
):
    """Personel saha ekiplerini konum + yuk ozetiyle gorur. Admin tum ekipleri,
    diger personel yalnizca KENDI MUDURLUGUNUN ekiplerini gorur - baska
    departmanin ekibine zaten is atayamaz."""
    return [
        EkipOzet.from_row(r)
        for r in crud.ekipler_ozeti(db, departman=None if alan.sinirsiz else alan.departman)
    ]


@router.get("/ekip-gorevleri", response_model=list[EkipGorevleri])
def ekip_gorevleri(
    _: User = Depends(personel),
    alan: Kapsam = Depends(kapsam),
    db: Session = Depends(get_db),
):
    """Personel yonetim panosu: her ekip + kendine dusen aktif gorevler. Ekip
    ozetleri (konum/yuk) ile aktif atamalar tek seferde cekilip ekip bazinda
    gruplanir."""
    ozetler = crud.ekipler_ozeti(db, departman=None if alan.sinirsiz else alan.departman)
    grup: dict[uuid.UUID, list[GorevOzet]] = {}
    for row in crud.aktif_atamalar(db, kapsam_turleri=alan.turler):
        gorev = row[0]
        grup.setdefault(gorev.worker_id, []).append(GorevOzet.from_row(row))
    # Ekip basina son tamamlananlar; aktif gorevlerle ayni desen (tek sorgu +
    # Python'da gruplama).
    tamamlanan: dict[uuid.UUID, list[TamamlananOzet]] = {}
    for row in crud.son_tamamlananlar(db):
        tamamlanan.setdefault(row[0].worker_id, []).append(TamamlananOzet.from_row(row))
    # Bolge/guzergahlar da ayni kotayi paylasan gorevlerdir; ekip basina
    # gruplanip tekil gorevlerle birlikte dondurulur.
    bolge_grup: dict[uuid.UUID, list[BolgeGorevOzet]] = {}
    for row in crud.aktif_bolge_gorevleri(
        db, departman=None if alan.sinirsiz else alan.departman
    ):
        bolge_grup.setdefault(row[0].worker_id, []).append(BolgeGorevOzet.from_row(row))
    return [
        EkipGorevleri(
            id=o.id,
            full_name=o.full_name,
            email=o.email,
            longitude=o.longitude,
            latitude=o.latitude,
            last_seen_at=o.last_seen_at,
            aktif_gorev=o.aktif_gorev,
            yaka=o.yaka,
            departman=o.departman,
            gorevler=grup.get(o.id, []),
            bolge_gorevleri=bolge_grup.get(o.id, []),
            son_tamamlananlar=tamamlanan.get(o.id, []),
        )
        for o in ozetler
    ]


@router.get("/havuz", response_model=list[HavuzVarlik])
def havuz(
    _: User = Depends(personel),
    alan: Kapsam = Depends(kapsam),
    db: Session = Depends(get_db),
):
    """Personel: havuzda bekleyen (henuz bir ekibe atanmamis) bakim varliklari.
    Buradan elle bir ekibe atanabilir (POST /ata)."""
    return [HavuzVarlik.from_row(r) for r in crud.havuz_varliklari(db, kapsam_turleri=alan.turler)]


@router.post("/ata", status_code=status.HTTP_204_NO_CONTENT)
def ata(
    data: AtamaGirdi,
    user: User = Depends(personel),
    alan: Kapsam = Depends(kapsam),
    db: Session = Depends(get_db),
):
    """Personel bir bakim varligini elle bir ekibe (yeniden) yonlendirir.

    Elle atama otomatik atamanin KAPASITE, YAKA ve DEPARTMAN kisitlarindan
    muaftir - yetki personeldedir, arayuz yalnizca uyarir (bkz.
    components/EkipSecici.tsx; gorev bolgesi/guzergah atamasi da ayni). Ama
    ISIN KENDISI kapsamda olmali: baska mudurlugun talebini yonlendirmek o
    mudurlugun isidir."""
    row = asset_crud.get_asset(db, data.asset_id)
    if row is None or not alan.izinli(row[0].type):
        raise HTTPException(status_code=404, detail="Varlik bulunamadi")
    asset = row[0]
    if asset.status != AssetStatus.bakim_lazim:
        raise HTTPException(
            status_code=409, detail="Yalnizca bakim bekleyen varliklar atanabilir"
        )

    worker = db.get(User, data.worker_id)
    if worker is None or worker.role != UserRole.saha_calisani:
        raise HTTPException(status_code=404, detail="Saha ekibi bulunamadi")

    crud.ata(db, asset, worker, assigned_by=user, kota_zorla=False)
    db.commit()
    _atama_degisti()


@router.get("/gorev/{asset_id}", response_model=GorevDurumu)
def gorev_bilgi(
    asset_id: uuid.UUID,
    _: User = Depends(personel),
    alan: Kapsam = Depends(kapsam),
    db: Session = Depends(get_db),
):
    """Bir varligin su an atali oldugu ekip (yoksa null: havuzda bekliyor) +
    varligin hangi yakada oldugu. Elle yonlendirme ekraninda 'once hangi ekipteydi'
    ve 'secilen ekip karsi yakada mi' gostermek icin."""
    row = asset_crud.get_asset(db, asset_id)
    if row is not None and not alan.izinli(row[0].type):
        raise HTTPException(status_code=404, detail="Varlik bulunamadi")
    gorev = crud.aktif_gorev_bilgisi(db, asset_id)
    kod = yaka_crud.yaka_bul(db, row[0].geometry) if row is not None else None
    return GorevDurumu(
        gorev=AktifGorevBilgi(**gorev) if gorev else None,
        varlik_yaka=kod,
        varlik_yaka_ad=yaka_crud.yaka_adlari(db).get(kod) if kod else None,
    )


@router.post("/geri-al", status_code=status.HTTP_204_NO_CONTENT)
def geri_al(
    data: VarlikRef,
    user: User = Depends(personel),
    alan: Kapsam = Depends(kapsam),
    db: Session = Depends(get_db),
):
    """Personel bir varligin aktif gorevini iptal edip varligi havuza dondurur."""
    row = asset_crud.get_asset(db, data.asset_id)
    if row is None or not alan.izinli(row[0].type):
        raise HTTPException(status_code=404, detail="Varlik bulunamadi")
    if not crud.geri_al(db, data.asset_id, actor=user):
        raise HTTPException(status_code=409, detail="Bu varligin aktif bir gorevi yok")
    db.commit()
    _atama_degisti()
