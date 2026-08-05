import uuid

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from .. import keycloak
from ..models.log import LogAction
from ..models.session import Session as SessionRow
from ..models.user import User, UserRole
from .log import add_log

# Departmani ZORUNLU olan roller. Admin tum departmanlari gorur, vatandasin
# departmani yoktur - ikisi de NULL kalir.
DEPARTMANLI_ROLLER = (UserRole.calisan, UserRole.saha_calisani)


def get_by_email(db: Session, email: str) -> User | None:
    return db.execute(select(User).where(User.email == email)).scalar_one_or_none()


def get_by_keycloak_id(db: Session, keycloak_id: uuid.UUID) -> User | None:
    return db.execute(
        select(User).where(User.keycloak_id == keycloak_id)
    ).scalar_one_or_none()


def keycloak_eslestir(
    db: Session,
    *,
    keycloak_id: uuid.UUID,
    email: str,
    full_name: str | None,
    role: UserRole,
) -> User:
    """Keycloak kimligini yerel satirla eslestirir (provisioning):
      1. `keycloak_id` bagli   -> satiri tazele.
      2. Ayni e-postali satir  -> baglantiyi kur; boylece Keycloak oncesi acilan
         hesaplar id'lerini (ve gorevlerini/bolgelerini) korur.
      3. Hicbiri yok           -> yeni satir (kendi kaydolan vatandaslar).

    Rol Keycloak'ta yasar; buradaki kolon sorgular icin tutulan bir aynadir.
    """
    email = email.lower()
    user = get_by_keycloak_id(db, keycloak_id) or get_by_email(db, email)

    if user is None:
        user = User(keycloak_id=keycloak_id, email=email, full_name=full_name, role=role)
        db.add(user)
    else:
        user.keycloak_id = keycloak_id
        user.email = email
        user.role = role
        # Ad Keycloak'ta duzenlenir; yerelde bos kalmasin diye kopyalanir.
        if full_name:
            user.full_name = full_name

    db.commit()
    db.refresh(user)
    return user


def get(db: Session, user_id: uuid.UUID) -> User | None:
    return db.get(User, user_id)


def aktif_admin_sayisi(db: Session) -> int:
    """Sistemde en az bir aktif yonetici kalmali; son admin kapatilamaz."""
    return (
        db.execute(
            select(func.count())
            .select_from(User)
            .where(User.role == UserRole.admin, User.is_active.is_(True))
        ).scalar_one()
    )


def list_users(db: Session) -> list[User]:
    return list(db.execute(select(User).order_by(User.created_at.desc())).scalars())


def create_user(
    db: Session,
    email: str,
    password: str,
    role: UserRole,
    full_name: str | None = None,
    actor: User | None = None,
    yaka: str | None = None,
    departman: str | None = None,
) -> User:
    """Hesabi once Keycloak'ta acar, sonra yerel satiri baglar. Sira bilincli:
    Keycloak'a yazamazsak yerelde giris yapamayan bir "hayalet ekip" kalmaz.

    Yerel satir hemen acilir (ilk girise birakilmaz) ki yeni ekip daha giris
    yapmadan ekip listesinde gorunup is alabilsin.

    `yaka` yalnizca saha_calisani rolunde dikkate alinir; `departman` ise
    `calisan` ve `saha_calisani` icin zorunludur (router dogrular), admin ve
    vatandas icin NULL'a zorlanir - admin zaten tum departmanlari gorur."""
    keycloak_id = keycloak.kullanici_olustur(
        email=email.lower(), parola=password, full_name=full_name, rol=role.value
    )
    user = User(
        email=email.lower(),
        keycloak_id=uuid.UUID(keycloak_id),
        full_name=full_name,
        role=role,
        yaka=yaka if role == UserRole.saha_calisani else None,
        departman=departman if role in DEPARTMANLI_ROLLER else None,
    )
    db.add(user)
    db.flush()  # id'yi almak icin

    if actor is not None:
        add_log(
            db,
            action=LogAction.user_created,
            actor=actor,
            entity_type="user",
            entity_id=user.id,
            entity_name=user.email,
            detail=role.value,
        )

    db.commit()
    db.refresh(user)
    return user


def set_active(db: Session, user: User, aktif: bool, actor: User) -> User:
    """Hesabi acar/kapatir. Uc kapi birden kapanmali:
      1. Keycloak - kapali hesap yeni token alamaz.
      2. `users.is_active` - elde gecerli token kalsa bile API 401 doner.
      3. `sessions` satirlari - token bizde durdugu icin satir silinmezse
         kullanici access token omru boyunca calismaya devam ederdi.

    Sira bilincli: once Keycloak. Oraya yazamazsak yerel satira dokunulmaz ve
    502 donulur, yani hata her iki yonde de guvenli tarafa duser."""
    if user.keycloak_id is not None:
        keycloak.kullanici_durumu(str(user.keycloak_id), aktif)

    user.is_active = aktif
    if not aktif:
        # Acik oturumlari dusur; satiri silmek oturumu gercekten iptal eder.
        db.execute(delete(SessionRow).where(SessionRow.user_id == user.id))

    add_log(
        db,
        action=LogAction.user_updated,
        actor=actor,
        entity_type="user",
        entity_id=user.id,
        entity_name=user.email,
        detail="Hesap açıldı" if aktif else "Hesap devre dışı bırakıldı",
    )
    db.commit()
    db.refresh(user)
    return user


def set_yaka(db: Session, user: User, yaka: str | None, actor: User) -> User:
    """Ekibin kadro yakasini ayarlar; None ise yaka son konumdan turetilir."""
    user.yaka = yaka
    add_log(
        db,
        action=LogAction.user_updated,
        actor=actor,
        entity_type="user",
        entity_id=user.id,
        entity_name=user.email,
        detail=f"Yaka: {yaka or 'konumdan türet'}",
    )
    db.commit()
    db.refresh(user)
    return user


def set_departman(db: Session, user: User, departman: str, actor: User) -> User:
    """Personelin mudurlugunu degistirir.

    Acik oturumlari DUSURULUR: kapsam her istekte `users.departman`'dan
    okundugu icin oturum teknik olarak dogru veriyi gorur, ama kullanicinin
    ekraninda hala eski departmanin listeleri acik durur ve bir sonraki
    tiklamada 404'lerle karsilasir. Yeniden giris, degisikligin nerede
    oldugunu net gosterir."""
    eski = user.departman
    user.departman = departman
    db.execute(delete(SessionRow).where(SessionRow.user_id == user.id))
    add_log(
        db,
        action=LogAction.user_updated,
        actor=actor,
        entity_type="user",
        entity_id=user.id,
        entity_name=user.email,
        detail=f"Departman: {eski or '—'} → {departman}",
    )
    db.commit()
    db.refresh(user)
    return user
