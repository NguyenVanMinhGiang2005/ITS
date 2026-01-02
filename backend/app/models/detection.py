from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, Field


class VehicleClass(str, Enum):
    CAR = "car"
    MOTORCYCLE = "motorcycle"
    BUS = "bus"
    TRUCK = "truck"
    BICYCLE = "bicycle"
    PERSON = "person"


class BoundingBox(BaseModel):
    x1: float
    y1: float
    x2: float
    y2: float


class Detection(BaseModel):
    bbox: BoundingBox
    class_name: str
    class_id: int
    confidence: float
    track_id: Optional[int] = None


class DetectionResult(BaseModel):
    detections: list[Detection]
    vehicle_count: dict[str, int]
    total_count: int
    frame_width: int
    frame_height: int
    processing_time_ms: float


class Point(BaseModel):
    x: float
    y: float


class ZonePolygon(BaseModel):
    id: str
    name: str
    points: list[Point]
    is_parking_zone: bool = False
    is_traffic_light: bool = False
    is_red_light: bool = False
    is_stop_line: bool = False  # Stop line zone for red light violation detection
    linked_traffic_light_id: Optional[str] = None  # ID of linked traffic light zone
    color: str = "#00FF00"


class ZoneConfig(BaseModel):
    camera_id: str
    zones: list[ZonePolygon]


class ParkingViolation(BaseModel):
    track_id: int
    vehicle_class: str
    zone_id: str
    zone_name: str
    duration_seconds: float
    bbox: BoundingBox


class RedLightViolation(BaseModel):
    track_id: int
    vehicle_class: str
    zone_id: str
    zone_name: str
    bbox: BoundingBox
    timestamp: str


class TrafficStats(BaseModel):
    camera_id: str
    timestamp: str
    vehicle_counts: dict[str, int]
    total_vehicles: int
    parking_violations: list[ParkingViolation]
    red_light_violations: list[RedLightViolation] = Field(default_factory=list)
    zones_occupancy: dict[str, int]


class DetectRequest(BaseModel):
    image_url: str
    camera_id: Optional[str] = None
    include_zones: bool = False


class DetectResponse(BaseModel):
    success: bool
    result: Optional[DetectionResult] = None
    violations: list[ParkingViolation] = Field(default_factory=list)
    red_light_violations: list[RedLightViolation] = Field(default_factory=list)
    error: Optional[str] = None
