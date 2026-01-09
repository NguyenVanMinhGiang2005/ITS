from __future__ import annotations

import glob
import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.core.config import settings

router = APIRouter()


def _upload_dir() -> str:
    p = os.path.normpath(settings.UPLOAD_DIR)
    if not os.path.isabs(p):
        p = os.path.normpath(os.path.join(os.getcwd(), p))
    os.makedirs(p, exist_ok=True)
    return p


def resolve_media_path(media_id: str) -> str | None:
    up = _upload_dir()
    # hỗ trợ id.* (id.mp4, id.jpg...)
    matches = glob.glob(os.path.join(up, f"{media_id}.*"))
    if matches:
        return matches[0]
    # fallback nếu lưu thẳng file không có ext
    p2 = os.path.join(up, media_id)
    if os.path.exists(p2):
        return p2
    return None


@router.get("/media/{media_id}")
async def get_media(media_id: str):
    path = resolve_media_path(media_id)
    if not path:
        raise HTTPException(status_code=404, detail="Media not found")
    return FileResponse(path)
