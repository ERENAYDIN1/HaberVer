"""Yaka (kita) cozumlemesi: bir noktanin hangi yakaya dustugunu ve bir saha
ekibinin 'etkin' yakasini bulur.

Neden en yakin (<->) ve ST_Contains degil: ilce sinirlari ~16 m toleransla
sadelestirilmis oldugu icin kiyidaki bir varlik/ekip poligonun birkac metre
disina dusebilir; ST_Contains bu durumda NULL dondurup varligi sessizce havuzda
biraktirirdi. En yakin yaka her zaman bir sonuc verir ve Bogaz'in ortasindaki
bir nokta icin de dogru tarafi secer."""

from sqlalchemy import String, case, cast, func, select
from sqlalchemy.orm import Session

from ..models.user import User
from ..models.yaka import YakaAlani


def nokta_yakasi_ifadesi(geom):
    """Bir geometri sutununun/ifadesinin dustugu yakanin kodunu veren korelasyonlu
    alt sorgu. Geometri NULL ise NULL doner (aksi halde ORDER BY NULL rastgele bir
    yaka secerdi)."""
    en_yakin = (
        select(YakaAlani.kod)
        .order_by(YakaAlani.geom.op("<->")(geom))
        .limit(1)
        .correlate_except(YakaAlani)
        .scalar_subquery()
    )
    return case((geom.isnot(None), en_yakin), else_=None)


def yaka_bul(db: Session, geom) -> str | None:
    """Bir noktanin dustugu yakanin kodu. Yakalar tablosu bossa None (bu durumda
    cagiran taraf yaka kisitini uygulamaz)."""
    return db.execute(
        select(YakaAlani.kod).order_by(YakaAlani.geom.op("<->")(geom)).limit(1)
    ).scalar_one_or_none()


def ekip_yakasi_ifadesi():
    """Bir User satirinin etkin yakasini veren SQL ifadesi: elle tanimlanmis
    users.yaka varsa o, yoksa son konumundan turetilen yaka (konum da yoksa NULL).

    Elle tanimli deger kasten oncelikli: ekip Bogaz kiyisinda ya da koprude
    dolasirken GPS'in bir anligina karsi yakaya dusmesi is dagitimini bozmasin."""
    return func.coalesce(
        cast(User.yaka, String), nokta_yakasi_ifadesi(User.last_location)
    )


def yaka_adlari(db: Session) -> dict[str, str]:
    """kod -> ad sozlugu (arayuzde 'Avrupa Yakası' gibi gostermek icin)."""
    return {
        kod: ad for kod, ad in db.execute(select(YakaAlani.kod, YakaAlani.ad)).all()
    }
