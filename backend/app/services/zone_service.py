import json
import os
from typing import Optional
from app.core.config import settings
from app.models.detection import ZonePolygon, ZoneConfig

def _get_zone_file_path(camera_id: str) -> str:
    base_dir = settings.ZONES_DIR
    if not os.path.isabs(base_dir):
        base_dir = os.path.join(os.getcwd(), base_dir)
    os.makedirs(base_dir, exist_ok=True)
    safe_id = "".join(c if c.isalnum() else "_" for c in camera_id)
    return os.path.join(base_dir, f"{safe_id}.json")

class ZoneService:
    @staticmethod
    async def get_zones(camera_id: str) -> list[ZonePolygon]:
        path = _get_zone_file_path(camera_id)
        if not os.path.exists(path):
            return []
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return [ZonePolygon(**z) for z in data]
        except Exception:
            return []

    @staticmethod
    async def save_zones(camera_id: str, zones: list[ZonePolygon]) -> bool:
        path = _get_zone_file_path(camera_id)
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump([z.model_dump() for z in zones], f, indent=2)
            return True
        except Exception:
            return False

    @staticmethod
    async def add_zone(camera_id: str, zone: ZonePolygon) -> list[ZonePolygon]:
        zones = await ZoneService.get_zones(camera_id)
        zones = [z for z in zones if z.id != zone.id]
        zones.append(zone)
        await ZoneService.save_zones(camera_id, zones)
        return zones

    @staticmethod
    async def delete_zone(camera_id: str, zone_id: str) -> list[ZonePolygon]:
        zones = await ZoneService.get_zones(camera_id)
        zones = [z for z in zones if z.id != zone_id]
        await ZoneService.save_zones(camera_id, zones)
        return zones

    @staticmethod
    async def clear_zones(camera_id: str) -> bool:
        path = _get_zone_file_path(camera_id)
        if os.path.exists(path):
            os.remove(path)
        return True
