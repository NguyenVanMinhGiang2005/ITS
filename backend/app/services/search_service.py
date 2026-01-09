from __future__ import annotations

import base64
import os
import re
import shutil
import uuid
from typing import Any

import cv2
import numpy as np
import httpx
from fastapi import UploadFile

from app.core.config import settings
from app.services.detection_service import DetectionService


_VIDEO_EXTS = (".mp4", ".mov", ".mkv", ".avi", ".webm", ".m3u8")
_IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".bmp", ".webp")


def _is_video_name(name: str) -> bool:
    n = (name or "").lower()
    return n.endswith(_VIDEO_EXTS) or ".m3u8" in n


def _is_image_name(name: str) -> bool:
    n = (name or "").lower()
    return n.endswith(_IMAGE_EXTS)


def _extract_first_url(text: str | None) -> str | None:
    if not text:
        return None
    m = re.search(r"(https?://\S+)", text.strip())
    if not m:
        return None
    url = m.group(1).strip()
    url = url.rstrip(').,;"\'')
    return url


def _upload_dir() -> str:
    path = os.path.normpath(settings.UPLOAD_DIR)
    if not os.path.isabs(path):
        path = os.path.normpath(os.path.join(os.getcwd(), path))
    os.makedirs(path, exist_ok=True)
    return path


def _public_base_url() -> str:
    # Có thể set env PUBLIC_BASE_URL nếu chạy server ở host khác
    return os.getenv("PUBLIC_BASE_URL", "http://localhost:8000").rstrip("/")


async def _fetch_image(url: str) -> np.ndarray | None:
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            r = await client.get(url)
            if r.status_code != 200:
                return None
            nparr = np.frombuffer(r.content, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            return img
    except Exception:
        return None


def _draw_and_encode_jpeg(frame_bgr: np.ndarray, dets: list[dict[str, Any]]) -> tuple[str, int, int]:
    CLASS_COLORS = {
        "car": (0, 255, 0),
        "motorcycle": (0, 255, 255),
        "bus": (0, 136, 255),
        "truck": (255, 0, 255),
        "bicycle": (255, 255, 0),
        "person": (255, 136, 0),
    }

    img = frame_bgr.copy()
    h, w = img.shape[:2]

    for d in dets:
        label = str(d.get("label", "obj"))
        conf = float(d.get("conf", 0.0))
        x1, y1, x2, y2 = d.get("bbox", [0, 0, 0, 0])
        x1, y1, x2, y2 = int(x1), int(y1), int(x2), int(y2)

        color = CLASS_COLORS.get(label, (0, 255, 0))
        cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)

        text = f"{label} {conf:.2f}"
        (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
        y_text = max(0, y1 - th - 6)
        cv2.rectangle(img, (x1, y_text), (x1 + tw + 6, y_text + th + 6), color, -1)
        cv2.putText(
            img,
            text,
            (x1 + 3, y_text + th + 2),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (0, 0, 0),
            2,
            cv2.LINE_AA,
        )

    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 75])
    if not ok:
        return ("", w, h)
    b64 = base64.b64encode(buf).decode("utf-8")
    return (b64, w, h)


class SearchService:
    def __init__(self) -> None:
        # giữ lại cho tương thích nếu FE có polling
        self.jobs: dict[str, dict[str, Any]] = {}

    async def handle(self, text: str | None, url: str | None, files: list[UploadFile] | None):
        files = files or []

        # Nếu link nằm trong text
        if not url:
            url = _extract_first_url(text)

        # Ưu tiên file nếu có
        if files:
            f = files[0]
            name = f.filename or ""
            ct = (f.content_type or "").lower()
            is_video = _is_video_name(name) or ct.startswith("video/")
            is_image = _is_image_name(name) or ct.startswith("image/")

            if is_image:
                return await self._handle_image_file(f)
            if is_video:
                return await self._handle_video_file(f)

            return {
                "mode": "sync",
                "status": "empty",
                "source": {"kind": "file", "name": name, "contentType": f.content_type},
                "detections": [],
                "summary": {},
            }

        # Không có file => xử lý theo URL
        if url:
            u = url.lower()
            is_video = _is_video_name(u) or ".m3u8" in u
            is_image = _is_image_name(u)

            if is_image:
                return await self._handle_image_url(url)
            if is_video:
                return self._accept_video_url(url)

        # Không có gì
        return {
            "mode": "sync",
            "status": "empty",
            "source": {"kind": "text", "text": (text or "").strip()},
            "detections": [],
            "summary": {},
        }

    def get_job(self, job_id: str):
        return self.jobs.get(job_id) or {
            "id": job_id,
            "status": "not_found",
            "progress": 0,
            "result": None,
            "error": None,
        }

    async def _handle_image_url(self, image_url: str):
        result = await DetectionService.detect_from_url(
            image_url=image_url, camera_id=None, use_tracking=False
        )
        if result is None:
            return {
                "mode": "sync",
                "status": "empty",
                "source": {"kind": "image", "url": image_url},
                "detections": [],
                "summary": {},
            }

        dets = []
        summary: dict[str, int] = {}
        for det in result.detections:
            label = det.class_name
            conf = float(det.confidence)
            bbox = [det.bbox.x1, det.bbox.y1, det.bbox.x2, det.bbox.y2]
            dets.append({"label": label, "conf": conf, "bbox": bbox, "track_id": det.track_id})
            summary[label] = summary.get(label, 0) + 1

        frame = await _fetch_image(image_url)
        annotated = None
        if frame is not None:
            b64, w, h = _draw_and_encode_jpeg(frame, dets)
            if b64:
                annotated = {"jpegBase64": b64, "width": w, "height": h}

        return {
            "mode": "sync",
            "status": "success" if dets else "empty",
            "source": {"kind": "image", "url": image_url},
            "detections": dets,
            "summary": summary,
            "annotated": annotated,
        }

    async def _handle_image_file(self, file: UploadFile):
        data = await file.read()
        nparr = np.frombuffer(data, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if frame is None:
            return {
                "mode": "sync",
                "status": "empty",
                "source": {"kind": "image", "name": file.filename},
                "detections": [],
                "summary": {},
            }

        result = await DetectionService.detect_from_frame(
            frame=frame, camera_id=None, use_tracking=False
        )
        if result is None:
            return {
                "mode": "sync",
                "status": "empty",
                "source": {"kind": "image", "name": file.filename},
                "detections": [],
                "summary": {},
            }

        dets = []
        summary: dict[str, int] = {}
        for det in result.detections:
            label = det.class_name
            conf = float(det.confidence)
            bbox = [det.bbox.x1, det.bbox.y1, det.bbox.x2, det.bbox.y2]
            dets.append({"label": label, "conf": conf, "bbox": bbox, "track_id": det.track_id})
            summary[label] = summary.get(label, 0) + 1

        b64, w, h = _draw_and_encode_jpeg(frame, dets)
        annotated = {"jpegBase64": b64, "width": w, "height": h} if b64 else None

        return {
            "mode": "sync",
            "status": "success" if dets else "empty",
            "source": {"kind": "image", "name": file.filename},
            "detections": dets,
            "summary": summary,
            "annotated": annotated,
        }

    def _accept_video_url(self, video_url: str):
        # Search page sẽ redirect sang Detection.tsx
        job_id = uuid.uuid4().hex
        return {
            "mode": "async",
            "status": "accepted",
            "jobId": job_id,
            "source": {"kind": "video", "url": video_url, "id": "search-video", "name": "Video"},
        }

    async def _handle_video_file(self, file: UploadFile):
        up = _upload_dir()
        media_id = uuid.uuid4().hex
        ext = os.path.splitext(file.filename or "")[1].lower()
        if not ext:
            ct = (file.content_type or "").lower()
            if "mp4" in ct:
                ext = ".mp4"
            elif "webm" in ct:
                ext = ".webm"
            else:
                ext = ".mp4"

        out_path = os.path.join(up, f"{media_id}{ext}")

        try:
            file.file.seek(0)
        except Exception:
            pass

        with open(out_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        public_url = f"{_public_base_url()}{settings.API_PREFIX}/media/{media_id}"

        return {
            "mode": "async",
            "status": "accepted",
            "jobId": media_id,
            "source": {
                "kind": "video",
                "url": public_url,
                "id": "upload-video",
                "name": file.filename or "Upload Video",
            },
        }
