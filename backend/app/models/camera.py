from pydantic import BaseModel
from typing import Optional

class CameraOut(BaseModel):
    id: str 
    name: str
    url: str
    location: Optional[str] = None

class CamerasListOut(BaseModel):
    items: list[CameraOut]
    total: int
