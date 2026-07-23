import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models.log import LogAction
from ..models.user import User, UserRole
from ..security import hash_password
from .log import add_log


def get_by_email(db: Session, email: str) -> User | None:
    return db.execute(select(User).where(User.email == email)).scalar_one_or_none()


def get(db: Session, user_id: uuid.UUID) -> User | None:
    return db.get(User, user_id)


def list_users(db: Session) -> list[User]:
    return list(db.execute(select(User).order_by(User.created_at.desc())).scalars())


def create_user(
    db: Session,
    email: str,
    password: str,
    role: UserRole,
    full_name: str | None = None,
    actor: User | None = None,
) -> User:
    """actor verildiginde (admin panelinden personel/admin hesabi acilirken) bir
    log kaydi olusur; vatandas oz-kaydinda actor None kalir, loglanmaz."""
    user = User(
        email=email.lower(),
        hashed_password=hash_password(password),
        full_name=full_name,
        role=role,
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
