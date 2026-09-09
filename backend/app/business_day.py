from datetime import datetime, date, time, timedelta, UTC
from zoneinfo import ZoneInfo
from fastapi import HTTPException

ZONE = ZoneInfo("America/Argentina/Buenos_Aires")


def business_day(moment=None):
    moment = moment or datetime.now(UTC)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    return (moment.astimezone(ZONE) - timedelta(hours=4)).date()


def period(start, end, role, last=None):
    today = business_day()
    if last is not None:
        if last not in (1, 7, 31) or start is not None or end is not None:
            raise HTTPException(422, "Elegí un filtro rápido o un rango manual de fechas.")
        start, end = today - timedelta(days=last - 1), today
    if start is None and end is None:
        start = end = today
    if start is None or end is None or start > end or (end - start).days >= 31:
        raise HTTPException(422, "Elegí un rango inclusivo de 1 a 31 jornadas, con inicio anterior o igual al fin.")
    if role != "admin" and (start != today or end != today):
        raise HTTPException(403, "El personal solo puede consultar la jornada actual.")
    if start.year < 1970 or end.year > 9998:
        raise HTTPException(422, "Fechas fuera del rango admitido.")
    lower = datetime.combine(start, time(4), ZONE).astimezone(UTC).replace(tzinfo=None)
    upper = datetime.combine(end + timedelta(days=1), time(4), ZONE).astimezone(UTC).replace(tzinfo=None)
    return start, end, lower, upper


def local_iso(moment):
    return moment.replace(tzinfo=UTC).astimezone(ZONE).isoformat()


def period_labels(start, end):
    start, end = str(start), str(end)
    def label(value):
        return date.fromisoformat(value).strftime("%d/%m/%Y")
    if start == end:
        return ("Jornada del " + label(start),
                "Desde las 04:00 de ese día hasta las 04:00 del día siguiente")
    following = date.fromisoformat(end) + timedelta(days=1)
    return (f"Jornadas del {label(start)} al {label(end)}",
            f"Desde el {label(start)} a las 04:00 hasta el {following.strftime('%d/%m/%Y')} a las 04:00. Cada jornada comienza a las 04:00.")
