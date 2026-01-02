import asyncio
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

import cv2
import httpx
import numpy as np
from app.core.config import settings
from app.models.detection import (
    BoundingBox,
    Detection,
    DetectionResult,
    ParkingViolation,
    ZonePolygon,
)
from app.services.tracker_service import TrackerManager
from app.services.zone_service import ZoneService
from shapely.geometry import Point, Polygon

logger = logging.getLogger(__name__)

_model = None
_model_lock = asyncio.Lock()
_executor = ThreadPoolExecutor(max_workers=2)

VEHICLE_CLASSES = {
    0: "person",
    1: "bicycle",
    2: "car",
    3: "motorcycle",
    5: "bus",
    7: "truck",
}

VEHICLE_CLASS_IDS = set(VEHICLE_CLASSES.keys())


async def _load_model():
    global _model
    async with _model_lock:
        if _model is not None:
            return _model

        from ultralytics import YOLO

        model_path = settings.YOLO_MODEL_PATH
        if not os.path.isabs(model_path):
            model_path = os.path.join(os.getcwd(), model_path)

        _model = YOLO(model_path)

        import torch

        if torch.cuda.is_available():
            _model.to("cuda")

        return _model


async def _fetch_image(url: str) -> Optional[np.ndarray]:
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            response = await client.get(url)
            if response.status_code != 200:
                return None
            image_bytes = response.content
            nparr = np.frombuffer(image_bytes, np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            return image
    except Exception:
        return None


def _capture_video_frame(video_url: str) -> Optional[np.ndarray]:
    try:
        cap = cv2.VideoCapture(video_url)
        if not cap.isOpened():
            return None

        ret, frame = cap.read()
        cap.release()

        if not ret or frame is None:
            return None

        return frame
    except Exception:
        return None


def _run_inference(model, image: np.ndarray) -> list:
    results = model.predict(
        source=image,
        conf=0.25,
        iou=0.45,
        classes=list(VEHICLE_CLASS_IDS),
        verbose=False,
        half=True,
    )
    return results


def _point_in_polygon(point: tuple[float, float], polygon_points: list) -> bool:
    poly = Polygon([(p.x, p.y) for p in polygon_points])
    return poly.contains(Point(point[0], point[1]))


def _get_bbox_center(bbox: BoundingBox) -> tuple[float, float]:
    return ((bbox.x1 + bbox.x2) / 2, (bbox.y1 + bbox.y2) / 2)


class DetectionService:
    @staticmethod
    def detect_traffic_light_color(frame: np.ndarray, zone_points: list) -> str:
        """
        Detect traffic light color by analyzing the pixels within the zone.
        Uses brightness-focused detection to find the active light.
        Returns: 'red', 'yellow', 'green', or 'unknown'
        """
        try:
            pts = np.array([[int(p.x), int(p.y)] for p in zone_points], np.int32)

            x, y, w, h = cv2.boundingRect(pts)
            logger.debug(
                f"Traffic light zone bounding rect: x={x}, y={y}, w={w}, h={h}"
            )

            x = max(0, x)
            y = max(0, y)
            x2 = min(frame.shape[1], x + w)
            y2 = min(frame.shape[0], y + h)

            if x2 <= x or y2 <= y:
                logger.warning(f"Invalid zone coordinates: x2={x2}, y2={y2}")
                return "unknown"

            roi = frame[y:y2, x:x2].copy()

            mask = np.zeros((y2 - y, x2 - x), dtype=np.uint8)
            local_pts = pts - [x, y]
            cv2.fillPoly(mask, [local_pts], 255)

            # Convert to HSV for color analysis
            hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)

            # Focus on bright areas (traffic lights are bright when on)
            # Extract the Value channel and find bright regions
            gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
            gray_masked = cv2.bitwise_and(gray, gray, mask=mask)

            # Find the brightest regions using adaptive threshold
            max_brightness = np.max(gray_masked)
            logger.debug(f"Max brightness in zone: {max_brightness}")
            if max_brightness < 50:  # Too dark, no active light
                logger.debug("Zone too dark, no active light detected")
                return "unknown"

            # Create brightness mask - focus on pixels that are at least 60% of max brightness
            brightness_threshold = max(50, int(max_brightness * 0.6))
            _, bright_mask = cv2.threshold(
                gray_masked, brightness_threshold, 255, cv2.THRESH_BINARY
            )

            # Combine with zone mask
            analysis_mask = cv2.bitwise_and(bright_mask, mask)

            # Apply morphological operations to clean up noise
            kernel = np.ones((3, 3), np.uint8)
            analysis_mask = cv2.morphologyEx(analysis_mask, cv2.MORPH_OPEN, kernel)
            analysis_mask = cv2.morphologyEx(analysis_mask, cv2.MORPH_CLOSE, kernel)

            total_bright_pixels = cv2.countNonZero(analysis_mask)
            logger.debug(f"Total bright pixels: {total_bright_pixels}")
            if total_bright_pixels < 10:  # Too few bright pixels
                logger.debug("Too few bright pixels for detection")
                return "unknown"

            # Expanded HSV ranges for better detection under various lighting conditions
            # Red color (wraps around in HSV)
            red_lower1 = np.array([0, 50, 50])  # Lower saturation/value for dim lights
            red_upper1 = np.array([12, 255, 255])  # Expanded hue range
            red_lower2 = np.array([155, 50, 50])  # Wrap-around red
            red_upper2 = np.array([180, 255, 255])

            # Yellow/Amber color
            yellow_lower = np.array([12, 50, 50])
            yellow_upper = np.array([40, 255, 255])  # Expanded to include orange-yellow

            # Green color
            green_lower = np.array([35, 50, 50])  # Start earlier for cyan-green
            green_upper = np.array(
                [95, 255, 255]
            )  # Extended for blue-green traffic lights

            # Create color masks combined with brightness mask
            red_mask1 = cv2.inRange(hsv, red_lower1, red_upper1)
            red_mask2 = cv2.inRange(hsv, red_lower2, red_upper2)
            red_mask = cv2.bitwise_or(red_mask1, red_mask2)
            red_mask = cv2.bitwise_and(red_mask, analysis_mask)

            yellow_mask = cv2.inRange(hsv, yellow_lower, yellow_upper)
            yellow_mask = cv2.bitwise_and(yellow_mask, analysis_mask)

            green_mask = cv2.inRange(hsv, green_lower, green_upper)
            green_mask = cv2.bitwise_and(green_mask, analysis_mask)

            red_count = cv2.countNonZero(red_mask)
            yellow_count = cv2.countNonZero(yellow_mask)
            green_count = cv2.countNonZero(green_mask)

            logger.debug(
                f"Color counts - Red: {red_count}, Yellow: {yellow_count}, Green: {green_count}"
            )

            # Use adaptive threshold based on bright pixels (much lower than before)
            # Only need 1% of bright pixels to match a color
            min_threshold = max(5, total_bright_pixels * 0.01)

            # Calculate percentages for better comparison
            total_color_pixels = red_count + yellow_count + green_count
            if total_color_pixels < min_threshold:
                logger.debug(
                    f"Total color pixels ({total_color_pixels}) below threshold ({min_threshold})"
                )
                return "unknown"

            red_pct = red_count / total_color_pixels if total_color_pixels > 0 else 0
            yellow_pct = (
                yellow_count / total_color_pixels if total_color_pixels > 0 else 0
            )
            green_pct = (
                green_count / total_color_pixels if total_color_pixels > 0 else 0
            )

            logger.debug(
                f"Color percentages - Red: {red_pct:.2%}, Yellow: {yellow_pct:.2%}, Green: {green_pct:.2%}"
            )

            # Determine color based on dominant percentage (at least 40% dominance)
            if red_pct > 0.4 and red_count >= min_threshold:
                logger.info(f"Detected RED light (pct={red_pct:.2%})")
                return "red"
            elif green_pct > 0.4 and green_count >= min_threshold:
                logger.info(f"Detected GREEN light (pct={green_pct:.2%})")
                return "green"
            elif yellow_pct > 0.4 and yellow_count >= min_threshold:
                logger.info(f"Detected YELLOW light (pct={yellow_pct:.2%})")
                return "yellow"

            # Fallback: pick the highest count if above minimum
            max_count = max(red_count, yellow_count, green_count)
            if max_count >= min_threshold:
                if max_count == red_count:
                    logger.info(f"Detected RED light (fallback, count={red_count})")
                    return "red"
                elif max_count == green_count:
                    logger.info(f"Detected GREEN light (fallback, count={green_count})")
                    return "green"
                elif max_count == yellow_count:
                    logger.info(
                        f"Detected YELLOW light (fallback, count={yellow_count})"
                    )
                    return "yellow"

            logger.debug("No dominant color detected, returning unknown")
            return "unknown"
        except Exception as e:
            logger.error(f"Error detecting traffic light color: {e}")
            return "unknown"

    @staticmethod
    async def detect_from_url(
        image_url: str, camera_id: Optional[str] = None, use_tracking: bool = True
    ) -> Optional[DetectionResult]:
        model = await _load_model()
        image = await _fetch_image(image_url)

        if image is None:
            return None

        start_time = time.time()

        loop = asyncio.get_event_loop()
        results = await loop.run_in_executor(_executor, _run_inference, model, image)

        if not results or len(results) == 0:
            return DetectionResult(
                detections=[],
                vehicle_count={},
                total_count=0,
                frame_width=image.shape[1],
                frame_height=image.shape[0],
                processing_time_ms=(time.time() - start_time) * 1000,
            )

        result = results[0]
        boxes = result.boxes

        detections = []
        tracking_inputs = []

        for i in range(len(boxes)):
            box = boxes[i]
            xyxy = box.xyxy[0].cpu().numpy()
            conf = float(box.conf[0].cpu().numpy())
            cls_id = int(box.cls[0].cpu().numpy())

            if cls_id not in VEHICLE_CLASSES:
                continue

            bbox = BoundingBox(
                x1=float(xyxy[0]),
                y1=float(xyxy[1]),
                x2=float(xyxy[2]),
                y2=float(xyxy[3]),
            )

            tracking_inputs.append((xyxy, cls_id))

            detections.append(
                Detection(
                    bbox=bbox,
                    class_name=VEHICLE_CLASSES[cls_id],
                    class_id=cls_id,
                    confidence=conf,
                    track_id=None,
                )
            )

        if use_tracking and camera_id:
            tracker = TrackerManager.get_tracker(camera_id)
            tracked = tracker.update(tracking_inputs)

            track_map = {}
            for track_id, bbox_arr, cls_id in tracked:
                cx, cy = (
                    (bbox_arr[0] + bbox_arr[2]) / 2,
                    (bbox_arr[1] + bbox_arr[3]) / 2,
                )
                track_map[(round(cx, 1), round(cy, 1))] = track_id

            for det in detections:
                cx = round((det.bbox.x1 + det.bbox.x2) / 2, 1)
                cy = round((det.bbox.y1 + det.bbox.y2) / 2, 1)
                det.track_id = track_map.get((cx, cy))

        vehicle_count = {}
        for det in detections:
            vehicle_count[det.class_name] = vehicle_count.get(det.class_name, 0) + 1

        processing_time = (time.time() - start_time) * 1000

        return DetectionResult(
            detections=detections,
            vehicle_count=vehicle_count,
            total_count=len(detections),
            frame_width=image.shape[1],
            frame_height=image.shape[0],
            processing_time_ms=processing_time,
        )

    @staticmethod
    async def detect_from_video_url(
        video_url: str, camera_id: Optional[str] = None, use_tracking: bool = True
    ) -> Optional[DetectionResult]:
        loop = asyncio.get_event_loop()
        frame = await loop.run_in_executor(_executor, _capture_video_frame, video_url)

        if frame is None:
            return None

        return await DetectionService.detect_from_frame(frame, camera_id, use_tracking)

    @staticmethod
    async def detect_from_frame(
        frame: np.ndarray, camera_id: Optional[str] = None, use_tracking: bool = True
    ) -> Optional[DetectionResult]:
        model = await _load_model()

        start_time = time.time()

        loop = asyncio.get_event_loop()
        results = await loop.run_in_executor(_executor, _run_inference, model, frame)

        if not results or len(results) == 0:
            return DetectionResult(
                detections=[],
                vehicle_count={},
                total_count=0,
                frame_width=frame.shape[1],
                frame_height=frame.shape[0],
                processing_time_ms=(time.time() - start_time) * 1000,
            )

        result = results[0]
        boxes = result.boxes

        detections = []
        tracking_inputs = []

        for i in range(len(boxes)):
            box = boxes[i]
            xyxy = box.xyxy[0].cpu().numpy()
            conf = float(box.conf[0].cpu().numpy())
            cls_id = int(box.cls[0].cpu().numpy())

            if cls_id not in VEHICLE_CLASSES:
                continue

            bbox = BoundingBox(
                x1=float(xyxy[0]),
                y1=float(xyxy[1]),
                x2=float(xyxy[2]),
                y2=float(xyxy[3]),
            )

            tracking_inputs.append((xyxy, cls_id))

            detections.append(
                Detection(
                    bbox=bbox,
                    class_name=VEHICLE_CLASSES[cls_id],
                    class_id=cls_id,
                    confidence=conf,
                    track_id=None,
                )
            )

        if use_tracking and camera_id:
            tracker = TrackerManager.get_tracker(camera_id)
            tracked = tracker.update(tracking_inputs)

            track_map = {}
            for track_id, bbox_arr, cls_id in tracked:
                cx, cy = (
                    (bbox_arr[0] + bbox_arr[2]) / 2,
                    (bbox_arr[1] + bbox_arr[3]) / 2,
                )
                track_map[(round(cx, 1), round(cy, 1))] = track_id

            for det in detections:
                cx = round((det.bbox.x1 + det.bbox.x2) / 2, 1)
                cy = round((det.bbox.y1 + det.bbox.y2) / 2, 1)
                det.track_id = track_map.get((cx, cy))

        vehicle_count = {}
        for det in detections:
            vehicle_count[det.class_name] = vehicle_count.get(det.class_name, 0) + 1

        processing_time = (time.time() - start_time) * 1000

        return DetectionResult(
            detections=detections,
            vehicle_count=vehicle_count,
            total_count=len(detections),
            frame_width=frame.shape[1],
            frame_height=frame.shape[0],
            processing_time_ms=processing_time,
        )

    @staticmethod
    async def check_parking_violations(
        detections: list[Detection], zones: list[ZonePolygon], camera_id: str
    ) -> list[ParkingViolation]:
        violations = []
        parking_zones = [z for z in zones if z.is_parking_zone]

        if not parking_zones:
            return violations

        tracker = TrackerManager.get_tracker(camera_id)
        threshold = settings.PARKING_VIOLATION_THRESHOLD

        for det in detections:
            if det.track_id is None:
                continue

            center = _get_bbox_center(det.bbox)

            for zone in parking_zones:
                if _point_in_polygon(center, zone.points):
                    duration = tracker.get_track_duration(det.track_id)

                    if duration >= threshold:
                        violations.append(
                            ParkingViolation(
                                track_id=det.track_id,
                                vehicle_class=det.class_name,
                                zone_id=zone.id,
                                zone_name=zone.name,
                                duration_seconds=duration,
                                bbox=det.bbox,
                            )
                        )
                    break

        return violations

    @staticmethod
    async def get_zones_occupancy(
        detections: list[Detection], zones: list[ZonePolygon]
    ) -> dict[str, int]:
        occupancy = {}

        for zone in zones:
            count = 0
            for det in detections:
                center = _get_bbox_center(det.bbox)
                if _point_in_polygon(center, zone.points):
                    count += 1
            occupancy[zone.id] = count

        return occupancy

    @staticmethod
    async def check_red_light_violations(
        detections: list[Detection], zones: list[ZonePolygon], camera_id: str
    ) -> list:
        """
        Check for red light violations using stop line zones.

        Logic:
        1. Find all stop_line zones that are linked to a traffic_light zone
        2. Check if the linked traffic_light is currently red
        3. If a vehicle crosses the stop_line while light is red = violation
        """
        from datetime import datetime

        from app.models.detection import RedLightViolation

        violations = []

        # Build a map of traffic light zones by ID
        traffic_light_map = {z.id: z for z in zones if z.is_traffic_light}

        # Find stop line zones that have a linked traffic light
        stop_line_zones = [
            z for z in zones if z.is_stop_line and z.linked_traffic_light_id
        ]

        if not stop_line_zones:
            # Fallback to old behavior: check if vehicle is in traffic light zone when red
            # This maintains backward compatibility
            traffic_light_zones = [
                z for z in zones if z.is_traffic_light and z.is_red_light
            ]

            if not traffic_light_zones:
                return violations

            for det in detections:
                if det.track_id is None:
                    continue
                if det.class_name == "person":
                    continue

                center = _get_bbox_center(det.bbox)

                for zone in traffic_light_zones:
                    if _point_in_polygon(center, zone.points):
                        violations.append(
                            RedLightViolation(
                                track_id=det.track_id,
                                vehicle_class=det.class_name,
                                zone_id=zone.id,
                                zone_name=zone.name,
                                bbox=det.bbox,
                                timestamp=datetime.now().isoformat(),
                            )
                        )
                        break
            return violations

        # New behavior: check stop line zones
        for det in detections:
            if det.track_id is None:
                continue

            if det.class_name == "person":
                continue

            center = _get_bbox_center(det.bbox)

            for stop_line in stop_line_zones:
                # Check if the linked traffic light exists and is red
                linked_light = traffic_light_map.get(stop_line.linked_traffic_light_id)

                if not linked_light:
                    logger.warning(
                        f"Stop line '{stop_line.name}' has invalid linked_traffic_light_id: "
                        f"{stop_line.linked_traffic_light_id}"
                    )
                    continue

                # Only check violation if the traffic light is RED
                if not linked_light.is_red_light:
                    continue

                # Check if vehicle is in the stop line zone
                if _point_in_polygon(center, stop_line.points):
                    violations.append(
                        RedLightViolation(
                            track_id=det.track_id,
                            vehicle_class=det.class_name,
                            zone_id=stop_line.id,
                            zone_name=f"{stop_line.name} (Light: {linked_light.name})",
                            bbox=det.bbox,
                            timestamp=datetime.now().isoformat(),
                        )
                    )
                    logger.info(
                        f"Red light violation detected: Vehicle #{det.track_id} "
                        f"({det.class_name}) crossed stop line '{stop_line.name}' "
                        f"while light '{linked_light.name}' is RED"
                    )
                    break

        return violations
