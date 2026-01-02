import asyncio
import json
from datetime import datetime
from typing import Optional

from app.models.detection import (
    DetectionResult,
    DetectRequest,
    DetectResponse,
    ParkingViolation,
    TrafficStats,
    ZoneConfig,
    ZonePolygon,
)
from app.services.detection_service import DetectionService
from app.services.tracker_service import TrackerManager
from app.services.zone_service import ZoneService
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/detection", tags=["detection"])


@router.post("/detect", response_model=DetectResponse)
async def detect_vehicles(request: DetectRequest):
    try:
        result = await DetectionService.detect_from_url(
            image_url=request.image_url,
            camera_id=request.camera_id,
            use_tracking=request.camera_id is not None,
        )

        if result is None:
            return DetectResponse(
                success=False, error="Failed to fetch or process image"
            )

        violations = []
        if request.include_zones and request.camera_id:
            zones = await ZoneService.get_zones(request.camera_id)
            violations = await DetectionService.check_parking_violations(
                result.detections, zones, request.camera_id
            )

        return DetectResponse(success=True, result=result, violations=violations)
    except Exception as e:
        return DetectResponse(success=False, error=str(e))


import base64

import cv2
import numpy as np
from pydantic import BaseModel


class DetectBase64Request(BaseModel):
    image_base64: str
    camera_id: str | None = None
    include_zones: bool = False


@router.post("/detect-base64", response_model=DetectResponse)
async def detect_vehicles_base64(request: DetectBase64Request):
    try:
        base64_data = request.image_base64
        if "," in base64_data:
            base64_data = base64_data.split(",")[1]

        image_bytes = base64.b64decode(base64_data)
        nparr = np.frombuffer(image_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if frame is None:
            return DetectResponse(success=False, error="Failed to decode image")

        result = await DetectionService.detect_from_frame(
            frame=frame,
            camera_id=request.camera_id,
            use_tracking=request.camera_id is not None,
        )

        if result is None:
            return DetectResponse(success=False, error="Detection failed")

        violations = []
        if request.include_zones and request.camera_id:
            zones = await ZoneService.get_zones(request.camera_id)
            violations = await DetectionService.check_parking_violations(
                result.detections, zones, request.camera_id
            )

        return DetectResponse(success=True, result=result, violations=violations)
    except Exception as e:
        return DetectResponse(success=False, error=str(e))


class DetectVideoRequest(BaseModel):
    video_url: str
    camera_id: str | None = None
    include_zones: bool = False


@router.post("/detect-video", response_model=DetectResponse)
async def detect_from_video(request: DetectVideoRequest):
    try:
        result = await DetectionService.detect_from_video_url(
            video_url=request.video_url,
            camera_id=request.camera_id,
            use_tracking=request.camera_id is not None,
        )

        if result is None:
            return DetectResponse(success=False, error="Failed to capture video frame")

        violations = []
        if request.include_zones and request.camera_id:
            zones = await ZoneService.get_zones(request.camera_id)
            violations = await DetectionService.check_parking_violations(
                result.detections, zones, request.camera_id
            )

        return DetectResponse(success=True, result=result, violations=violations)
    except Exception as e:
        return DetectResponse(success=False, error=str(e))


@router.get("/zones/{camera_id}")
async def get_zones(camera_id: str):
    zones = await ZoneService.get_zones(camera_id)
    return {"camera_id": camera_id, "zones": [z.model_dump() for z in zones]}


@router.post("/zones/{camera_id}")
async def save_zones(camera_id: str, config: ZoneConfig):
    success = await ZoneService.save_zones(camera_id, config.zones)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save zones")
    return {"success": True, "zones_count": len(config.zones)}


@router.post("/zones/{camera_id}/add")
async def add_zone(camera_id: str, zone: ZonePolygon):
    zones = await ZoneService.add_zone(camera_id, zone)
    return {"success": True, "zones": [z.model_dump() for z in zones]}


@router.delete("/zones/{camera_id}/{zone_id}")
async def delete_zone(camera_id: str, zone_id: str):
    zones = await ZoneService.delete_zone(camera_id, zone_id)
    return {"success": True, "zones": [z.model_dump() for z in zones]}


@router.delete("/zones/{camera_id}")
async def clear_zones(camera_id: str):
    success = await ZoneService.clear_zones(camera_id)
    return {"success": success}


@router.post("/tracker/{camera_id}/reset")
async def reset_tracker(camera_id: str):
    TrackerManager.reset_tracker(camera_id)
    return {"success": True}


@router.get("/stats/{camera_id}")
async def get_traffic_stats(camera_id: str, image_url: str):
    result = await DetectionService.detect_from_url(
        image_url=image_url, camera_id=camera_id, use_tracking=True
    )

    if result is None:
        raise HTTPException(status_code=400, detail="Failed to process image")

    zones = await ZoneService.get_zones(camera_id)
    violations = await DetectionService.check_parking_violations(
        result.detections, zones, camera_id
    )
    occupancy = await DetectionService.get_zones_occupancy(result.detections, zones)

    return TrafficStats(
        camera_id=camera_id,
        timestamp=datetime.now().isoformat(),
        vehicle_counts=result.vehicle_count,
        total_vehicles=result.total_count,
        parking_violations=violations,
        zones_occupancy=occupancy,
    )


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, camera_id: str):
        await websocket.accept()
        if camera_id not in self.active_connections:
            self.active_connections[camera_id] = []
        self.active_connections[camera_id].append(websocket)

    def disconnect(self, websocket: WebSocket, camera_id: str):
        if camera_id in self.active_connections:
            if websocket in self.active_connections[camera_id]:
                self.active_connections[camera_id].remove(websocket)

    async def broadcast(self, camera_id: str, message: dict):
        if camera_id in self.active_connections:
            dead = []
            for connection in self.active_connections[camera_id]:
                try:
                    await connection.send_json(message)
                except:
                    dead.append(connection)
            for conn in dead:
                self.disconnect(conn, camera_id)


manager = ConnectionManager()


@router.websocket("/stream/{camera_id}")
async def detection_stream(websocket: WebSocket, camera_id: str):
    await manager.connect(websocket, camera_id)

    try:
        while True:
            data = await websocket.receive_json()

            if data.get("type") == "detect":
                image_url = data.get("image_url")
                if not image_url:
                    await websocket.send_json({"error": "image_url required"})
                    continue

                result = await DetectionService.detect_from_url(
                    image_url=image_url, camera_id=camera_id, use_tracking=True
                )

                if result:
                    zones = await ZoneService.get_zones(camera_id)
                    violations = await DetectionService.check_parking_violations(
                        result.detections, zones, camera_id
                    )

                    await websocket.send_json(
                        {
                            "type": "detection_result",
                            "result": result.model_dump(),
                            "violations": [v.model_dump() for v in violations],
                            "timestamp": datetime.now().isoformat(),
                        }
                    )
                else:
                    await websocket.send_json(
                        {"type": "error", "error": "Detection failed"}
                    )

            elif data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        manager.disconnect(websocket, camera_id)
    except Exception:
        manager.disconnect(websocket, camera_id)


@router.websocket("/video-stream/{camera_id}")
async def video_detection_stream(websocket: WebSocket, camera_id: str):
    await websocket.accept()

    try:
        data = await websocket.receive_json()
        video_url = data.get("video_url")
        send_frame = data.get("send_frame", True)

        if not video_url:
            await websocket.send_json({"type": "error", "error": "video_url required"})
            await websocket.close()
            return

        import cv2

        cap = cv2.VideoCapture(video_url)

        if not cap.isOpened():
            await websocket.send_json(
                {"type": "error", "error": "Failed to open video stream"}
            )
            await websocket.close()
            return

        await websocket.send_json(
            {"type": "connected", "message": "Video stream connected"}
        )

        zones = await ZoneService.get_zones(camera_id)

        CLASS_COLORS = {
            "car": (0, 255, 0),
            "motorcycle": (0, 255, 255),
            "bus": (0, 136, 255),
            "truck": (255, 0, 255),
            "bicycle": (255, 255, 0),
            "person": (255, 136, 0),
        }

        while True:
            try:
                msg = await asyncio.wait_for(websocket.receive_json(), timeout=0.01)
                if msg.get("type") == "stop":
                    break
                if msg.get("type") == "update_zones":
                    zones = await ZoneService.get_zones(camera_id)
            except asyncio.TimeoutError:
                pass
            except:
                break

            ret, frame = cap.read()
            if not ret:
                cap.release()
                cap = cv2.VideoCapture(video_url)
                await asyncio.sleep(0.5)
                continue

            result = await DetectionService.detect_from_frame(
                frame=frame, camera_id=camera_id, use_tracking=True
            )

            if result:
                # Auto-detect traffic light color for each zone
                for zone in zones:
                    if zone.is_traffic_light:
                        detected_color = DetectionService.detect_traffic_light_color(
                            frame, zone.points
                        )
                        if detected_color == "red":
                            zone.is_red_light = True
                        elif detected_color == "green":
                            zone.is_red_light = False
                        # If yellow/unknown, keep previous state or default (False)
                        # We could add an is_yellow_light state if needed

                violations = await DetectionService.check_parking_violations(
                    result.detections, zones, camera_id
                )
                red_light_violations = (
                    await DetectionService.check_red_light_violations(
                        result.detections, zones, camera_id
                    )
                )

                violation_ids = set(v.track_id for v in violations)
                red_light_ids = set(v.track_id for v in red_light_violations)

                # Build traffic light map for stop line zones
                traffic_light_map = {z.id: z for z in zones if z.is_traffic_light}

                for zone in zones:
                    if len(zone.points) >= 3:
                        pts = np.array(
                            [[int(p.x), int(p.y)] for p in zone.points], np.int32
                        )
                        if zone.is_traffic_light:
                            if zone.is_red_light:
                                color = (0, 0, 255)  # Red
                                status_text = "RED"
                            else:
                                color = (0, 255, 0)  # Green
                                status_text = "GREEN"

                            cv2.polylines(frame, [pts], True, color, 3)
                            label = f"🚦 {zone.name} {status_text}"
                            cv2.putText(
                                frame,
                                label,
                                (int(zone.points[0].x), int(zone.points[0].y) - 10),
                                cv2.FONT_HERSHEY_SIMPLEX,
                                0.7,
                                color,
                                2,
                            )
                        elif zone.is_stop_line:
                            # Stop line zone - color based on linked traffic light
                            linked_light = traffic_light_map.get(
                                zone.linked_traffic_light_id
                            )
                            if linked_light and linked_light.is_red_light:
                                color = (0, 0, 255)  # Red - danger zone
                                status_text = "STOP!"
                            else:
                                color = (255, 255, 255)  # White - safe to cross
                                status_text = "GO"

                            # Draw dashed line for stop line
                            cv2.polylines(frame, [pts], True, color, 3)
                            label = f"🚧 {zone.name} [{status_text}]"
                            cv2.putText(
                                frame,
                                label,
                                (int(zone.points[0].x), int(zone.points[0].y) - 10),
                                cv2.FONT_HERSHEY_SIMPLEX,
                                0.6,
                                color,
                                2,
                            )
                        else:
                            color = (0, 0, 255) if zone.is_parking_zone else (0, 255, 0)
                            cv2.polylines(frame, [pts], True, color, 2)
                            cv2.putText(
                                frame,
                                zone.name,
                                (int(zone.points[0].x), int(zone.points[0].y) - 10),
                                cv2.FONT_HERSHEY_SIMPLEX,
                                0.6,
                                color,
                                2,
                            )

                for det in result.detections:
                    is_parking_violation = det.track_id in violation_ids
                    is_red_light_violation = det.track_id in red_light_ids
                    is_violation = is_parking_violation or is_red_light_violation

                    if is_red_light_violation:
                        color = (0, 0, 255)
                    elif is_parking_violation:
                        color = (0, 100, 255)
                    else:
                        color = CLASS_COLORS.get(det.class_name, (0, 255, 0))

                    x1, y1 = int(det.bbox.x1), int(det.bbox.y1)
                    x2, y2 = int(det.bbox.x2), int(det.bbox.y2)

                    cv2.rectangle(
                        frame, (x1, y1), (x2, y2), color, 2 if not is_violation else 3
                    )

                    label = (
                        f"#{det.track_id} {det.class_name}"
                        if det.track_id
                        else det.class_name
                    )
                    if is_red_light_violation:
                        label = f"⚠️ RED LIGHT! {label}"
                    label_size, _ = cv2.getTextSize(
                        label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 2
                    )
                    cv2.rectangle(
                        frame,
                        (x1, y1 - label_size[1] - 10),
                        (x1 + label_size[0], y1),
                        color,
                        -1,
                    )
                    cv2.putText(
                        frame,
                        label,
                        (x1, y1 - 5),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.5,
                        (0, 0, 0),
                        2,
                    )

                response_data = {
                    "type": "detection_result",
                    "result": result.model_dump(),
                    "violations": [v.model_dump() for v in violations],
                    "red_light_violations": [
                        v.model_dump() for v in red_light_violations
                    ],
                    "timestamp": datetime.now().isoformat(),
                }

                if send_frame:
                    _, buffer = cv2.imencode(
                        ".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70]
                    )
                    frame_base64 = base64.b64encode(buffer).decode("utf-8")
                    response_data["frame"] = f"data:image/jpeg;base64,{frame_base64}"

                await websocket.send_json(response_data)

            await asyncio.sleep(0.05)

        cap.release()
        await websocket.close()

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "error": str(e)})
        except:
            pass
