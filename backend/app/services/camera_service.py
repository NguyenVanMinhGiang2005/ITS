import json
import os
from typing import Any
from app.core.config import settings
from urllib.parse import urlparse, parse_qs

# khởi tạo bộ nhớ đệm 
_cache: list[dict[str, Any]] | None = None
_cache_mtime: float | None = None # lưu lại thời gian để biết khi nào phải thay đổi để cập nhập lại _cache


def _load_json() -> list[dict[str, Any]]:
    global _cache, _cache_mtime

    path = settings.DATA
    if not os.path.isabs(path):
        path = os.path.join(os.getcwd(), path) # print(path) -> C:\Users\{Username}\Project\data\file.txt (vi du)
    
    st = os.stat(path) # get in4 file 
    if _cache is not None and _cache_mtime == st.st_mtime:
        return _cache
    
    # đọc file
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if not isinstance(data, list):
        raise ValueError("data.json must be a JSON array (list of cameras)")
    
    normalized = []
    for item in data:
        if not isinstance(item, dict): #check key-value
            continue

        id = item.get("_id", "")
        if isinstance(id, dict) and "$oid" in id:
            clean_id = id["$oid"]
        else:
            clean_id = id

        name = item.get("name", "")
        url_raw = item.get("url", "")
        url_clean = url_raw # Giá trị mặc định
        if name == "Tp. HCM":
            try:
                parsed_url = urlparse(url_raw)
                query_params = parse_qs(parsed_url.query)
                
                cam_id_list = query_params.get("camId")
                if cam_id_list:
                    cam_id = cam_id_list[0]
                    url_clean = f"https://giaothong.hochiminhcity.gov.vn/render/ImageHandler.ashx?id={cam_id}"
            except Exception:
                url_clean = url_raw
    
        normalized.append({
            "id": clean_id,
            "name": item.get("name", ""),
            "location": item.get("location", None),
            "url": url_clean,
        })
    
    _cache = normalized
    _cache_mtime = st.st_mtime
    return normalized

class CameraService:
    @staticmethod
    async def list_camera(skip: int = 50, limit: int = 0) -> tuple[list[dict],int]:
        items = _load_json()
        total = len(items) # số lượng camera
        return items[skip: skip + limit], total
    
    @staticmethod
    async def get_camera(camera_id: str) -> dict | None:
        item = _load_json()
        for cam in item:
            if cam == camera_id:
                return cam
        
        return None
