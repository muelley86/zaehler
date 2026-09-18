"""Gemeinsame Helfer fuer Datei-Uploads der API."""

from __future__ import annotations

from fastapi import UploadFile

from meters.core.problem import ProblemError


def read_limited(upload: UploadFile, max_bytes: int) -> bytes:
    """Liest den Upload hoechstens bis ``max_bytes``; groessere Dateien -> 413 (RFC 7807).

    Prueft zuerst die gemeldete Groesse und liest dann ein Byte ueber der Grenze, damit auch
    eine fehlende oder falsche Groessenangabe nicht durchrutscht.
    """
    detail = f"Maximal {max_bytes // (1024 * 1024)} MB."
    if upload.size is not None and upload.size > max_bytes:
        raise ProblemError(status_code=413, title="Datei zu groß", detail=detail)
    upload.file.seek(0)
    daten = upload.file.read(max_bytes + 1)
    if len(daten) > max_bytes:
        raise ProblemError(status_code=413, title="Datei zu groß", detail=detail)
    return daten
