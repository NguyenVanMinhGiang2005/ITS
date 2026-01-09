from __future__ import annotations

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from app.services.search_service import SearchService

router = APIRouter()
svc = SearchService()


@router.post("/search")
async def search(
    text: str | None = Form(default=None),
    url: str | None = Form(default=None),
    files: list[UploadFile] = File(default=[]),
    file: UploadFile | None = File(default=None),  # backward-compat (nếu có ai gọi "file")
):
    # FE hiện tại gửi: text + files[]
    if file is not None and not files:
        files = [file]

    if not (text or url or files):
        raise HTTPException(status_code=400, detail="Provide text/url or upload file(s)")

    return await svc.handle(text=text, url=url, files=files)


@router.get("/search/jobs/{job_id}")
async def get_job(job_id: str):
    # Giữ endpoint để FE không bị hỏng nếu có polling
    return svc.get_job(job_id)
