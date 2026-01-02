const API_BASE =
  (import.meta as any)?.env?.VITE_API_BASE?.toString?.() ||
  (import.meta as any)?.env?.VITE_API_URL?.toString?.() ||
  "http://localhost:8000";

export interface Camera {
  id: string;
  name: string;
  location: string;
  url: string;
}

export async function fetchCameras(
  limit = 200,
  skip = 0,
): Promise<{ items: Camera[]; total: number }> {
  const response = await fetch(
    `${API_BASE}/api/cameras?limit=${limit}&skip=${skip}`,
  );
  return response.json();
}

export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Detection {
  bbox: BoundingBox;
  class_name: string;
  class_id: number;
  confidence: number;
  track_id: number | null;
}

export interface DetectionResult {
  detections: Detection[];
  vehicle_count: Record<string, number>;
  total_count: number;
  frame_width: number;
  frame_height: number;
  processing_time_ms: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface ZonePolygon {
  id: string;
  name: string;
  points: Point[];
  is_parking_zone: boolean;
  is_traffic_light: boolean;
  is_red_light: boolean;
  is_stop_line: boolean;
  linked_traffic_light_id: string | null;
  color: string;
}

export interface ParkingViolation {
  track_id: number;
  vehicle_class: string;
  zone_id: string;
  zone_name: string;
  duration_seconds: number;
  bbox: BoundingBox;
}

export interface DetectResponse {
  success: boolean;
  result: DetectionResult | null;
  violations: ParkingViolation[];
  error: string | null;
}

export interface TrafficStats {
  camera_id: string;
  timestamp: string;
  vehicle_counts: Record<string, number>;
  total_vehicles: number;
  parking_violations: ParkingViolation[];
  zones_occupancy: Record<string, number>;
}

export async function detectVehicles(
  imageUrl: string,
  cameraId?: string,
  includeZones: boolean = false,
): Promise<DetectResponse> {
  const response = await fetch(`${API_BASE}/api/detection/detect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image_url: imageUrl,
      camera_id: cameraId,
      include_zones: includeZones,
    }),
  });
  return response.json();
}

export async function getZones(
  cameraId: string,
): Promise<{ camera_id: string; zones: ZonePolygon[] }> {
  const response = await fetch(
    `${API_BASE}/api/detection/zones/${encodeURIComponent(cameraId)}`,
  );
  return response.json();
}

export async function saveZones(
  cameraId: string,
  zones: ZonePolygon[],
): Promise<{ success: boolean }> {
  const response = await fetch(
    `${API_BASE}/api/detection/zones/${encodeURIComponent(cameraId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ camera_id: cameraId, zones }),
    },
  );
  return response.json();
}

export async function addZone(
  cameraId: string,
  zone: ZonePolygon,
): Promise<{ success: boolean; zones: ZonePolygon[] }> {
  const response = await fetch(
    `${API_BASE}/api/detection/zones/${encodeURIComponent(cameraId)}/add`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(zone),
    },
  );
  return response.json();
}

export async function deleteZone(
  cameraId: string,
  zoneId: string,
): Promise<{ success: boolean; zones: ZonePolygon[] }> {
  const response = await fetch(
    `${API_BASE}/api/detection/zones/${encodeURIComponent(cameraId)}/${encodeURIComponent(zoneId)}`,
    {
      method: "DELETE",
    },
  );
  return response.json();
}

export async function resetTracker(
  cameraId: string,
): Promise<{ success: boolean }> {
  const response = await fetch(
    `${API_BASE}/api/detection/tracker/${encodeURIComponent(cameraId)}/reset`,
    {
      method: "POST",
    },
  );
  return response.json();
}

export async function getTrafficStats(
  cameraId: string,
  imageUrl: string,
): Promise<TrafficStats> {
  const params = new URLSearchParams({ image_url: imageUrl });
  const response = await fetch(
    `${API_BASE}/api/detection/stats/${encodeURIComponent(cameraId)}?${params}`,
  );
  return response.json();
}

export function createDetectionWebSocket(cameraId: string): WebSocket {
  const wsBase = API_BASE.replace(/^http/, "ws");
  return new WebSocket(
    `${wsBase}/api/detection/stream/${encodeURIComponent(cameraId)}`,
  );
}
