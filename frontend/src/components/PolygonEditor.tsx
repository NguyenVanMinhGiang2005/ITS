import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ZonePolygon, Point } from "@/lib/api";

interface PolygonEditorProps {
  zones: ZonePolygon[];
  frameWidth: number;
  frameHeight: number;
  containerWidth: number;
  containerHeight: number;
  onZoneAdd: (zone: ZonePolygon) => void;
  onZoneDelete: (zoneId: string) => void;
  onZonesClear: () => void;
  onZoneUpdate?: (zone: ZonePolygon) => void;
  isEditing: boolean;
  onEditingChange: (editing: boolean) => void;
}

function generateId(): string {
  return `zone_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

const ZONE_COLORS = [
  "#00FF00",
  "#FF8800",
  "#00FFFF",
  "#FF00FF",
  "#FFFF00",
  "#8800FF",
];

type ZoneType = "normal" | "parking" | "traffic_light" | "stop_line";

export default function PolygonEditor({
  zones,
  frameWidth,
  frameHeight,
  containerWidth,
  containerHeight,
  onZoneAdd,
  onZoneDelete,
  onZonesClear,
  onZoneUpdate,
  isEditing,
  onEditingChange,
}: PolygonEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [zoneName, setZoneName] = useState("");
  const [zoneType, setZoneType] = useState<ZoneType>("normal");
  const [linkedTrafficLightId, setLinkedTrafficLightId] = useState<string>("");

  const safeFrameWidth = frameWidth || 640;
  const safeFrameHeight = frameHeight || 360;
  const safeContainerWidth = containerWidth || 640;
  const safeContainerHeight = containerHeight || 360;

  const scaleX = safeContainerWidth / safeFrameWidth;
  const scaleY = safeContainerHeight / safeFrameHeight;

  // Get all traffic light zones for linking
  const trafficLightZones = zones.filter((z) => z.is_traffic_light);

  const toFrameCoords = useCallback(
    (clientX: number, clientY: number, rect: DOMRect): Point => {
      const x = (clientX - rect.left) / scaleX;
      const y = (clientY - rect.top) / scaleY;
      return { x, y };
    },
    [scaleX, scaleY],
  );

  const getZoneColor = (zone: ZonePolygon) => {
    if (zone.is_traffic_light) {
      return zone.is_red_light
        ? "rgba(255, 0, 0, 0.35)"
        : "rgba(0, 255, 0, 0.35)";
    }
    if (zone.is_stop_line) {
      // Check if linked traffic light is red
      const linkedLight = zones.find(
        (z) => z.id === zone.linked_traffic_light_id,
      );
      if (linkedLight?.is_red_light) {
        return "rgba(255, 0, 0, 0.4)"; // Red when light is red
      }
      return "rgba(255, 255, 255, 0.3)"; // White/transparent when green
    }
    return zone.is_parking_zone
      ? "rgba(255, 0, 0, 0.25)"
      : "rgba(0, 255, 0, 0.25)";
  };

  const getZoneStrokeColor = (zone: ZonePolygon) => {
    if (zone.is_stop_line) {
      const linkedLight = zones.find(
        (z) => z.id === zone.linked_traffic_light_id,
      );
      return linkedLight?.is_red_light ? "#FF0000" : "#FFFFFF";
    }
    return zone.color || "#00FF00";
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = safeContainerWidth;
    canvas.height = safeContainerHeight;

    ctx.clearRect(0, 0, safeContainerWidth, safeContainerHeight);

    for (let i = 0; i < zones.length; i++) {
      const zone = zones[i];
      if (zone.points.length < 3) continue;

      ctx.beginPath();
      ctx.moveTo(zone.points[0].x * scaleX, zone.points[0].y * scaleY);
      for (let j = 1; j < zone.points.length; j++) {
        ctx.lineTo(zone.points[j].x * scaleX, zone.points[j].y * scaleY);
      }
      ctx.closePath();

      ctx.fillStyle = getZoneColor(zone);
      ctx.fill();

      ctx.strokeStyle = getZoneStrokeColor(zone);
      ctx.lineWidth = zone.is_traffic_light || zone.is_stop_line ? 4 : 3;
      if (zone.is_stop_line) {
        ctx.setLineDash([10, 5]); // Dashed line for stop line
      } else {
        ctx.setLineDash([]);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "#FFFFFF";
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 3;
      ctx.font = "bold 14px Arial";
      const labelX = zone.points[0].x * scaleX + 5;
      const labelY = zone.points[0].y * scaleY + 20;
      let label = zone.name;
      if (zone.is_traffic_light) {
        label = `🚦 ${zone.name} ${zone.is_red_light ? "🔴" : "🟢"}`;
      } else if (zone.is_stop_line) {
        const linkedLight = zones.find(
          (z) => z.id === zone.linked_traffic_light_id,
        );
        const lightStatus = linkedLight
          ? linkedLight.is_red_light
            ? "🔴"
            : "🟢"
          : "⚠️";
        label = `🚧 ${zone.name} ${lightStatus}`;
      }
      ctx.strokeText(label, labelX, labelY);
      ctx.fillText(label, labelX, labelY);

      // Draw link line from stop_line to traffic_light
      if (zone.is_stop_line && zone.linked_traffic_light_id) {
        const linkedLight = zones.find(
          (z) => z.id === zone.linked_traffic_light_id,
        );
        if (linkedLight && linkedLight.points.length > 0) {
          const stopCenter = {
            x: zone.points.reduce((s, p) => s + p.x, 0) / zone.points.length,
            y: zone.points.reduce((s, p) => s + p.y, 0) / zone.points.length,
          };
          const lightCenter = {
            x:
              linkedLight.points.reduce((s, p) => s + p.x, 0) /
              linkedLight.points.length,
            y:
              linkedLight.points.reduce((s, p) => s + p.y, 0) /
              linkedLight.points.length,
          };
          ctx.beginPath();
          ctx.moveTo(stopCenter.x * scaleX, stopCenter.y * scaleY);
          ctx.lineTo(lightCenter.x * scaleX, lightCenter.y * scaleY);
          ctx.strokeStyle = "rgba(255, 255, 0, 0.5)";
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    if (isEditing && currentPoints.length > 0) {
      ctx.beginPath();
      ctx.moveTo(currentPoints[0].x * scaleX, currentPoints[0].y * scaleY);
      for (let i = 1; i < currentPoints.length; i++) {
        ctx.lineTo(currentPoints[i].x * scaleX, currentPoints[i].y * scaleY);
      }
      const strokeColor =
        zoneType === "traffic_light"
          ? "#FFFF00"
          : zoneType === "parking"
            ? "#FF0000"
            : zoneType === "stop_line"
              ? "#FFFFFF"
              : "#00FF00";
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      for (const point of currentPoints) {
        ctx.beginPath();
        ctx.arc(point.x * scaleX, point.y * scaleY, 8, 0, Math.PI * 2);
        ctx.fillStyle = strokeColor;
        ctx.fill();
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }, [
    zones,
    currentPoints,
    isEditing,
    zoneType,
    scaleX,
    scaleY,
    safeContainerWidth,
    safeContainerHeight,
  ]);

  useEffect(() => {
    draw();
  }, [draw]);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isEditing) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const point = toFrameCoords(e.clientX, e.clientY, rect);
      setCurrentPoints((prev) => [...prev, point]);
    },
    [isEditing, toFrameCoords],
  );

  const handleSaveZone = useCallback(() => {
    if (currentPoints.length < 3) return;

    // Validate stop_line must have linked traffic light
    if (zoneType === "stop_line" && !linkedTrafficLightId) {
      alert("Stop Line must be linked to a Traffic Light zone!");
      return;
    }

    const zone: ZonePolygon = {
      id: generateId(),
      name: zoneName || `Zone ${zones.length + 1}`,
      points: currentPoints,
      is_parking_zone: zoneType === "parking",
      is_traffic_light: zoneType === "traffic_light",
      is_red_light: false,
      is_stop_line: zoneType === "stop_line",
      linked_traffic_light_id:
        zoneType === "stop_line" ? linkedTrafficLightId : null,
      color:
        zoneType === "traffic_light"
          ? "#FFFF00"
          : zoneType === "stop_line"
            ? "#FFFFFF"
            : ZONE_COLORS[zones.length % ZONE_COLORS.length],
    };

    onZoneAdd(zone);
    setCurrentPoints([]);
    setZoneName("");
    setZoneType("normal");
    setLinkedTrafficLightId("");
    onEditingChange(false);
  }, [
    currentPoints,
    zoneName,
    zoneType,
    linkedTrafficLightId,
    zones.length,
    onZoneAdd,
    onEditingChange,
  ]);

  const handleCancel = useCallback(() => {
    setCurrentPoints([]);
    setZoneName("");
    setZoneType("normal");
    setLinkedTrafficLightId("");
    onEditingChange(false);
  }, [onEditingChange]);

  const handleUndo = useCallback(() => {
    setCurrentPoints((prev) => prev.slice(0, -1));
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        width={safeContainerWidth}
        height={safeContainerHeight}
        onClick={handleCanvasClick}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          cursor: isEditing ? "crosshair" : "default",
          pointerEvents: isEditing ? "auto" : "none",
          zIndex: isEditing ? 20 : 5,
        }}
      />

      <div
        className="absolute bottom-2 left-2 right-2 flex flex-wrap gap-2 items-center bg-black/80 p-3 rounded-lg"
        style={{ zIndex: 30 }}
      >
        {!isEditing ? (
          <>
            <Button
              size="sm"
              onClick={() => onEditingChange(true)}
              className="bg-green-600 hover:bg-green-700"
            >
              + Add Zone
            </Button>
            {zones.length > 0 && (
              <Button size="sm" variant="destructive" onClick={onZonesClear}>
                Clear All
              </Button>
            )}
            <div className="flex-1" />
            <span className="text-white text-sm font-medium">
              {zones.length} zone(s)
            </span>
          </>
        ) : (
          <>
            <Input
              placeholder="Zone name"
              value={zoneName}
              onChange={(e) => setZoneName(e.target.value)}
              className="w-24 h-8 bg-white text-black"
            />
            <select
              value={zoneType}
              onChange={(e) => {
                setZoneType(e.target.value as ZoneType);
                if (e.target.value !== "stop_line") {
                  setLinkedTrafficLightId("");
                }
              }}
              className="h-8 px-2 rounded bg-white text-black text-sm"
            >
              <option value="normal">Normal</option>
              <option value="parking">🅿️ Parking</option>
              <option value="traffic_light">🚦 Traffic Light</option>
              <option value="stop_line">🚧 Stop Line</option>
            </select>

            {/* Show traffic light selector when stop_line is selected */}
            {zoneType === "stop_line" && (
              <select
                value={linkedTrafficLightId}
                onChange={(e) => setLinkedTrafficLightId(e.target.value)}
                className="h-8 px-2 rounded bg-white text-black text-sm"
              >
                <option value="">-- Link to Light --</option>
                {trafficLightZones.map((light) => (
                  <option key={light.id} value={light.id}>
                    🚦 {light.name}
                  </option>
                ))}
              </select>
            )}

            <span className="text-yellow-400 text-sm font-bold">
              {currentPoints.length} pts
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={handleUndo}
              disabled={currentPoints.length === 0}
            >
              Undo
            </Button>
            <Button
              size="sm"
              onClick={handleSaveZone}
              disabled={
                currentPoints.length < 3 ||
                (zoneType === "stop_line" && !linkedTrafficLightId)
              }
              className="bg-green-600 hover:bg-green-700"
            >
              Save
            </Button>
            <Button size="sm" variant="destructive" onClick={handleCancel}>
              Cancel
            </Button>
          </>
        )}
      </div>

      {/* Help text for stop_line */}
      {isEditing && zoneType === "stop_line" && (
        <div
          className="absolute top-2 left-2 bg-yellow-500/90 text-black px-3 py-2 rounded-lg text-sm"
          style={{ zIndex: 30 }}
        >
          <strong>🚧 Stop Line:</strong> Draw the stop line area (white line
          before intersection).
          <br />
          Vehicles crossing this when linked traffic light is RED = Violation!
          {trafficLightZones.length === 0 && (
            <div className="text-red-800 mt-1">
              ⚠️ No traffic light zones found. Create a traffic light zone
              first!
            </div>
          )}
        </div>
      )}

      {zones.length > 0 && !isEditing && (
        <div
          className="absolute top-2 right-2 bg-black/80 p-2 rounded-lg max-h-48 overflow-y-auto"
          style={{ zIndex: 30 }}
        >
          <div className="text-white text-xs font-bold mb-1">Zones</div>
          {zones.map((zone) => (
            <div
              key={zone.id}
              className="flex items-center gap-2 text-white text-xs py-1"
            >
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: zone.color }}
              />
              <span
                className={
                  zone.is_traffic_light
                    ? "text-yellow-400"
                    : zone.is_stop_line
                      ? "text-white"
                      : zone.is_parking_zone
                        ? "text-red-400"
                        : "text-green-400"
                }
              >
                {zone.is_traffic_light && "🚦 "}
                {zone.is_stop_line && "🚧 "}
                {zone.name}
                {zone.is_stop_line && zone.linked_traffic_light_id && (
                  <span className="text-gray-400 ml-1">
                    →{" "}
                    {zones.find((z) => z.id === zone.linked_traffic_light_id)
                      ?.name || "?"}
                  </span>
                )}
              </span>
              <button
                onClick={() => onZoneDelete(zone.id)}
                className="text-red-400 hover:text-red-300 ml-auto"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
