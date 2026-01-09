from __future__ import annotations

import base64
import os
import re
import shutil
import uuid
from typing import Any

import cv2
import httpx
import numpy as np
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from urllib.parse import urlparse

from app.core.config import settings
from app.routes.media_routes import resolve_media_path
from app.services.detection_service import DetectionService

router = APIRouter()


def _upload_dir() -> str:
    p = os.path.normpath(settings.UPLOAD_DIR)
    if not os.path.isabs(p):
        p = os.path.normpath(os.path.join(os.getcwd(), p))
    os.makedirs(p, exist_ok=True)
    return p


def _public_base_url() -> str:
    # nếu bạn deploy khác host: set env PUBLIC_BASE_URL
    return os.getenv("PUBLIC_BASE_URL", "http://localhost:8000").rstrip("/")


def _is_image_ext(name: str) -> bool:
    n = (name or "").lower()
    return any(n.endswith(x) for x in [".jpg", ".jpeg", ".png", ".webp", ".bmp"])


def _draw_and_encode_jpeg(frame_bgr: np.ndarray, dets: list[dict[str, Any]]) -> dict[str, Any] | None:
    img = frame_bgr.copy()
    h, w = img.shape[:2]

    for d in dets:
        label = str(d.get("label", "obj"))
        conf = float(d.get("conf", 0.0))
        x1, y1, x2, y2 = d.get("bbox", [0, 0, 0, 0])
        x1, y1, x2, y2 = int(x1), int(y1), int(x2), int(y2)

        cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 2)
        text = f"{label} {conf:.2f}"
        cv2.putText(img, text, (x1, max(15, y1 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)

    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 75])
    if not ok:
        return None

    return {
        "jpegBase64": base64.b64encode(buf).decode("utf-8"),
        "width": w,
        "height": h,
    }


async def _fetch_image(url: str) -> np.ndarray | None:
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            r = await client.get(url)
            if r.status_code != 200:
                return None
            nparr = np.frombuffer(r.content, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            return img
    except Exception:
        return None


def _resolve_media_url_to_local(video_or_image_url: str) -> str | None:
    """
    Nếu url là dạng http://host/api/media/{id} => resolve ra file local để cv2 đọc ổn.
    """
    try:
        parsed = urlparse(video_or_image_url)
        path = parsed.path or video_or_image_url
        marker = f"{settings.API_PREFIX}/media/"
        if marker in path:
            media_id = path.split(marker, 1)[1].split("/", 1)[0]
            return resolve_media_path(media_id)
    except Exception:
        pass
    return None


# ================== 1) Upload image ==================
@router.post("/upload-image")
async def upload_image(file: UploadFile = File(...)):
    if not (file.content_type or "").lower().startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image is allowed")

    up = _upload_dir()
    media_id = uuid.uuid4().hex
    ext = os.path.splitext(file.filename or "")[1].lower()
    if not ext or not _is_image_ext(file.filename or ""):
        ext = ".jpg"

    out_path = os.path.join(up, f"{media_id}{ext}")

    try:
        file.file.seek(0)
    except Exception:
        pass

    with open(out_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    url = f"{_public_base_url()}{settings.API_PREFIX}/media/{media_id}"
    return {"url": url}


# ================== 2) Upload video ==================
@router.post("/upload-video")
async def upload_video(file: UploadFile = File(...)):
    if not (file.content_type or "").lower().startswith("video/"):
        raise HTTPException(status_code=400, detail="Only video is allowed")

    up = _upload_dir()
    media_id = uuid.uuid4().hex
    ext = os.path.splitext(file.filename or "")[1].lower() or ".mp4"
    out_path = os.path.join(up, f"{media_id}{ext}")

    try:
        file.file.seek(0)
    except Exception:
        pass

    with open(out_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    url = f"{_public_base_url()}{settings.API_PREFIX}/media/{media_id}"
    return {"url": url, "id": "upload-video", "name": file.filename or "Upload Video"}


# ================== 3) Detect image ==================
class DetectImageReq(BaseModel):
    imageUrl: str


@router.post("/detect-image")
async def detect_image(req: DetectImageReq):
    image_url = req.imageUrl.strip()

    # Nếu là /api/media/{id} => đọc local
    local = _resolve_media_url_to_local(image_url)

    if local and os.path.exists(local):
        frame = cv2.imread(local)
        if frame is None:
            raise HTTPException(status_code=400, detail="Cannot read local image")

        result = await DetectionService.detect_from_frame(frame=frame, camera_id=None, use_tracking=False)
    else:
        # detect từ URL
        result = await DetectionService.detect_from_url(image_url=image_url, camera_id=None, use_tracking=False)

    if result is None:
        return {
            "mode": "sync",
            "status": "empty",
            "source": {"kind": "image", "url": image_url},
            "detections": [],
            "summary": {},
            "annotated": None,
        }

    dets: list[dict[str, Any]] = []
    summary: dict[str, int] = {}

    for det in result.detections:
        label = det.class_name
        conf = float(det.confidence)
        bbox = [det.bbox.x1, det.bbox.y1, det.bbox.x2, det.bbox.y2]
        dets.append({"label": label, "conf": conf, "bbox": bbox, "track_id": det.track_id})
        summary[label] = summary.get(label, 0) + 1

    # tạo annotated image base64 để FE render
    frame = None
    if local and os.path.exists(local):
        frame = cv2.imread(local)
    else:
        frame = await _fetch_image(image_url)

    annotated = _draw_and_encode_jpeg(frame, dets) if frame is not None else None

    return {
        "mode": "sync",
        "status": "success" if dets else "empty",
        "source": {"kind": "image", "url": image_url},
        "detections": dets,
        "summary": summary,
        "annotated": annotated,
    }
