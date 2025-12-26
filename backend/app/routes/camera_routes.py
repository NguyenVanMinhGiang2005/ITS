# backend\app\routes\camera_routes.py

from fastapi import APIRouter, HTTPException, Query
from app.models.camera import CamerasListOut, CameraOut
from app.services.camera_service import CameraService

router = APIRouter(prefix="/cameras", tags=["cameras"])

@router.get("", response_model=CamerasListOut)
async def list_cameras(
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
):
    items, total = await CameraService.list_camera(limit=limit, skip=skip)
    return {"items": items, "total": total}

@router.get("/{camera_id}", response_model=CameraOut)
async def get_camera(camera_id: str):
    doc = await CameraService.get_camera(camera_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Camera not found")
    return doc
