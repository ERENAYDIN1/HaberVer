"""Departman sozlugu ve tur -> departman yonlendirmesi.

Yetki kararlarinin dayandigi tek okuma noktasi: bir kullanicinin gorebilecegi
tur kumesi (`kullanici_kapsami`) ve bir turun sahibi departman (`tur_departmani`).
Yonlendirme kodda sabit degil `tur_departman` tablosundadir - bir belediye
orgutlenmesini degistirdiginde migration degil, admin panelinde bir satir
degisir."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models.asset import AssetType
from ..models.bolge import Bolge
from ..models.departman import Departman, TurDepartman
from ..models.log import ActivityLog, LogAction
from ..models.user import User, UserRole


def list_departmanlar(db: Session, yalniz_aktif: bool = False) -> list[Departman]:
    # `sira` once: alfabetik siralama triyaj kovasini ("Cozum Merkezi")
    # listenin basina tasiyordu. Ad yalnizca esit siralarda ayirir.
    stmt = select(Departman).order_by(Departman.sira, Departman.ad)
    if yalniz_aktif:
        stmt = stmt.where(Departman.aktif.is_(True))
    return list(db.execute(stmt).scalars().all())


def get(db: Session, kod: str) -> Departman | None:
    return db.get(Departman, kod)


def esleme(db: Session) -> dict[AssetType, str]:
    """tur -> departman_kod sozlugu (tek sorgu)."""
    return {
        tur: kod
        for tur, kod in db.execute(
            select(TurDepartman.tur, TurDepartman.departman_kod)
        ).all()
    }


def tur_departmani(db: Session, tur: AssetType) -> str | None:
    """Bir turun sahibi departmanin kodu. Tablo eksikse (bos kurulum) None
    doner ve cagiran taraf departman kisitini uygulamaz - yaka kisitiyla ayni
    guvenli davranis."""
    return db.execute(
        select(TurDepartman.departman_kod).where(TurDepartman.tur == tur)
    ).scalar_one_or_none()


def departman_turleri(db: Session, kod: str) -> set[AssetType]:
    """Bir departmanin kapsadigi turler."""
    return set(
        db.execute(
            select(TurDepartman.tur).where(TurDepartman.departman_kod == kod)
        )
        .scalars()
        .all()
    )


def kullanici_kapsami(db: Session, user: User, etkin_rol: UserRole) -> set[AssetType] | None:
    """Kullanicinin gorebilecegi/yonetebilecegi tur kumesi.

    None = SINIRSIZ. Yalnizca admin icin doner; cagiran taraf None gorunce
    hicbir filtre uygulamaz.

    `calisan`/`saha_calisani` icin departmanin turleri doner. Departmani NULL
    olan bir personel BOS KUME alir, yani hicbir sey goremez - "departmansiz"
    sessizce "her seye yetkili" anlamina gelmemeli. Bu durum pratikte
    olusmamali: POST/PATCH /api/users bu iki rol icin departmani zorunlu kilar
    ve migration 0007 mevcut satirlari doldurur.

    `vatandas` da bos kume alir; zaten hicbir personel ucuna erisemez."""
    if etkin_rol is UserRole.admin:
        return None
    if user.departman is None:
        return set()
    return departman_turleri(db, user.departman)


def esleme_guncelle(
    db: Session,
    yeni_esleme: dict[AssetType, str],
    actor: User,
) -> dict[AssetType, str]:
    """Tur -> departman yonlendirmesini gunceller. Yalnizca DEGISEN turler
    yazilir ve her biri ayri loglanir; audit'te "hangi tur nereden nereye"
    gorulebilsin diye toplu bir "esleme guncellendi" kaydi yeterli degil."""
    # Yerel import: crud/log.py departman cozumlemesi icin BU modulu okur,
    # modul duzeyinde import dongusel olurdu.
    from .log import add_log

    mevcut = esleme(db)
    for tur, yeni_kod in yeni_esleme.items():
        eski_kod = mevcut.get(tur)
        if eski_kod == yeni_kod:
            continue
        satir = db.get(TurDepartman, tur)
        if satir is None:
            satir = TurDepartman(tur=tur, departman_kod=yeni_kod)
            db.add(satir)
        else:
            satir.departman_kod = yeni_kod
        add_log(
            db,
            action=LogAction.tur_departman_changed,
            actor=actor,
            entity_type="tur_departman",
            entity_id=None,
            entity_name=tur.value,
            detail=f"{eski_kod or '—'} → {yeni_kod}",
        )
    db.commit()
    return esleme(db)


def kullanim(db: Session, kod: str) -> dict[str, int]:
    """Mudurluge bagli kayit sayilari. Silme reddedilirken gerekcedir:
    "kullaniliyor" demek yetmez, admin neyi tasimasi gerektigini bilmeli.

    Audit log ve gorev bolgeleri de sayilir cunku ikisi de mudurluk koduna FK
    ile baglidir. Bu, gecmisi olan bir mudurlugu pratikte silinemez yapar -
    bilincli: bir mudurlugun kapanmasi gecmisini yok etmemeli, `aktif=false`
    ile emekliye ayrilir."""
    return {
        "personel": db.execute(
            select(func.count(User.id)).where(User.departman == kod)
        ).scalar_one(),
        "tur": db.execute(
            select(func.count(TurDepartman.tur)).where(
                TurDepartman.departman_kod == kod
            )
        ).scalar_one(),
        "kayit": db.execute(
            select(func.count(ActivityLog.id)).where(ActivityLog.departman == kod)
        ).scalar_one(),
        "bolge": db.execute(
            select(func.count(Bolge.id)).where(Bolge.departman == kod)
        ).scalar_one(),
    }


def create(db: Session, data, actor: User) -> Departman:
    from .log import add_log

    departman = Departman(
        kod=data.kod,
        ad=data.ad,
        aciklama=data.aciklama,
        renk=data.renk,
        aktif=data.aktif,
        sira=data.sira,
    )
    db.add(departman)
    add_log(
        db,
        action=LogAction.departman_created,
        actor=actor,
        entity_type="departman",
        entity_id=None,
        entity_name=data.ad,
        detail=data.kod,
    )
    db.commit()
    return departman


def update(db: Session, kod: str, data, actor: User) -> Departman | None:
    from .log import add_log

    departman = db.get(Departman, kod)
    if departman is None:
        return None
    yazilan = {
        alan: deger
        for alan, deger in data.model_dump(exclude_unset=True).items()
        if getattr(departman, alan) != deger
    }
    for alan, deger in yazilan.items():
        setattr(departman, alan, deger)
    if yazilan:
        add_log(
            db,
            action=LogAction.departman_updated,
            actor=actor,
            entity_type="departman",
            entity_id=None,
            entity_name=departman.ad,
            detail=", ".join(sorted(yazilan)),
        )
    db.commit()
    return departman


def delete(db: Session, kod: str, actor: User) -> bool:
    """Mudurlugu siler. Bagli personel/tur olup olmadigini cagiran taraf
    kontrol eder (`kullanim`); buraya gelindiginde karar verilmistir."""
    from .log import add_log

    departman = db.get(Departman, kod)
    if departman is None:
        return False
    add_log(
        db,
        action=LogAction.departman_deleted,
        actor=actor,
        entity_type="departman",
        entity_id=None,
        entity_name=departman.ad,
        detail=kod,
    )
    db.delete(departman)
    db.commit()
    return True


def adlar(db: Session) -> dict[str, str]:
    """kod -> ad sozlugu (rozet/uyari metinlerinde 'Fen İşleri Müdürlüğü')."""
    return {kod: ad for kod, ad in db.execute(select(Departman.kod, Departman.ad)).all()}


def personel_sayilari(db: Session) -> dict[str, int]:
    """departman_kod -> aktif personel sayisi (admin ekraninda gosterilir)."""
    return {
        kod: sayi
        for kod, sayi in db.execute(
            select(User.departman, func.count(User.id))
            .where(User.departman.isnot(None), User.is_active.is_(True))
            .group_by(User.departman)
        ).all()
    }
