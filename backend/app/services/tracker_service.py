import time
from typing import Optional
from collections import defaultdict
import numpy as np

class SimpleTracker:
    def __init__(self, max_disappeared: int = 30, iou_threshold: float = 0.3):
        self.next_id = 0
        self.objects: dict[int, np.ndarray] = {}
        self.disappeared: dict[int, int] = {}
        self.class_ids: dict[int, int] = {}
        self.first_seen: dict[int, float] = {}
        self.max_disappeared = max_disappeared
        self.iou_threshold = iou_threshold

    def _compute_iou(self, box1: np.ndarray, box2: np.ndarray) -> float:
        x1 = max(box1[0], box2[0])
        y1 = max(box1[1], box2[1])
        x2 = min(box1[2], box2[2])
        y2 = min(box1[3], box2[3])
        
        inter_area = max(0, x2 - x1) * max(0, y2 - y1)
        box1_area = (box1[2] - box1[0]) * (box1[3] - box1[1])
        box2_area = (box2[2] - box2[0]) * (box2[3] - box2[1])
        union_area = box1_area + box2_area - inter_area
        
        if union_area == 0:
            return 0.0
        return inter_area / union_area

    def _register(self, bbox: np.ndarray, class_id: int) -> int:
        obj_id = self.next_id
        self.objects[obj_id] = bbox
        self.disappeared[obj_id] = 0
        self.class_ids[obj_id] = class_id
        self.first_seen[obj_id] = time.time()
        self.next_id += 1
        return obj_id

    def _deregister(self, obj_id: int):
        del self.objects[obj_id]
        del self.disappeared[obj_id]
        del self.class_ids[obj_id]
        del self.first_seen[obj_id]

    def update(self, detections: list[tuple[np.ndarray, int]]) -> list[tuple[int, np.ndarray, int]]:
        if len(detections) == 0:
            for obj_id in list(self.disappeared.keys()):
                self.disappeared[obj_id] += 1
                if self.disappeared[obj_id] > self.max_disappeared:
                    self._deregister(obj_id)
            return [(obj_id, bbox, self.class_ids[obj_id]) for obj_id, bbox in self.objects.items()]

        input_bboxes = np.array([d[0] for d in detections])
        input_class_ids = [d[1] for d in detections]

        if len(self.objects) == 0:
            for i in range(len(detections)):
                self._register(input_bboxes[i], input_class_ids[i])
        else:
            object_ids = list(self.objects.keys())
            object_bboxes = np.array(list(self.objects.values()))

            iou_matrix = np.zeros((len(object_ids), len(input_bboxes)))
            for i, obj_bbox in enumerate(object_bboxes):
                for j, inp_bbox in enumerate(input_bboxes):
                    iou_matrix[i, j] = self._compute_iou(obj_bbox, inp_bbox)

            used_rows = set()
            used_cols = set()
            matches = []

            flat_indices = np.argsort(iou_matrix.flatten())[::-1]
            for idx in flat_indices:
                row = idx // iou_matrix.shape[1]
                col = idx % iou_matrix.shape[1]
                if row in used_rows or col in used_cols:
                    continue
                if iou_matrix[row, col] < self.iou_threshold:
                    break
                matches.append((row, col))
                used_rows.add(row)
                used_cols.add(col)

            for row, col in matches:
                obj_id = object_ids[row]
                self.objects[obj_id] = input_bboxes[col]
                self.class_ids[obj_id] = input_class_ids[col]
                self.disappeared[obj_id] = 0

            unused_rows = set(range(len(object_ids))) - used_rows
            for row in unused_rows:
                obj_id = object_ids[row]
                self.disappeared[obj_id] += 1
                if self.disappeared[obj_id] > self.max_disappeared:
                    self._deregister(obj_id)

            unused_cols = set(range(len(input_bboxes))) - used_cols
            for col in unused_cols:
                self._register(input_bboxes[col], input_class_ids[col])

        return [(obj_id, bbox, self.class_ids[obj_id]) for obj_id, bbox in self.objects.items()]

    def get_track_duration(self, track_id: int) -> float:
        if track_id in self.first_seen:
            return time.time() - self.first_seen[track_id]
        return 0.0

    def reset(self):
        self.objects.clear()
        self.disappeared.clear()
        self.class_ids.clear()
        self.first_seen.clear()
        self.next_id = 0


class TrackerManager:
    _trackers: dict[str, SimpleTracker] = {}

    @classmethod
    def get_tracker(cls, camera_id: str) -> SimpleTracker:
        if camera_id not in cls._trackers:
            cls._trackers[camera_id] = SimpleTracker()
        return cls._trackers[camera_id]

    @classmethod
    def reset_tracker(cls, camera_id: str):
        if camera_id in cls._trackers:
            cls._trackers[camera_id].reset()

    @classmethod
    def remove_tracker(cls, camera_id: str):
        if camera_id in cls._trackers:
            del cls._trackers[camera_id]
