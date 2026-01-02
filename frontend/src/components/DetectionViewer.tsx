import { useEffect, useRef, useCallback, useState } from "react";
import type { Detection, ZonePolygon, ParkingViolation } from "@/lib/api";

interface DetectionViewerProps {
    detections: Detection[];
    zones: ZonePolygon[];
    violations: ParkingViolation[];
    frameWidth: number;
    frameHeight: number;
    containerWidth: number;
    containerHeight: number;
    showLabels?: boolean;
    showZones?: boolean;
    showViolations?: boolean;
}

const CLASS_COLORS: Record<string, string> = {
    car: "#00FF00",
    motorcycle: "#FFFF00",
    bus: "#FF8800",
    truck: "#FF00FF",
    bicycle: "#00FFFF",
    person: "#0088FF",
};

const VIOLATION_COLOR = "#FF0000";

function getColor(className: string, isViolation: boolean): string {
    if (isViolation) return VIOLATION_COLOR;
    return CLASS_COLORS[className] || "#00FF00";
}

export default function DetectionViewer({
    detections,
    zones,
    violations,
    frameWidth,
    frameHeight,
    containerWidth,
    containerHeight,
    showLabels = true,
    showZones = true,
    showViolations = true,
}: DetectionViewerProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const violationTrackIds = new Set(violations.map((v) => v.track_id));

    const safeFrameWidth = frameWidth || 640;
    const safeFrameHeight = frameHeight || 360;
    const safeContainerWidth = containerWidth || 640;
    const safeContainerHeight = containerHeight || 360;

    const scaleX = safeContainerWidth / safeFrameWidth;
    const scaleY = safeContainerHeight / safeFrameHeight;

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        canvas.width = safeContainerWidth;
        canvas.height = safeContainerHeight;

        ctx.clearRect(0, 0, safeContainerWidth, safeContainerHeight);

        if (showZones && zones.length > 0) {
            for (const zone of zones) {
                if (zone.points.length < 3) continue;

                ctx.beginPath();
                ctx.moveTo(zone.points[0].x * scaleX, zone.points[0].y * scaleY);
                for (let i = 1; i < zone.points.length; i++) {
                    ctx.lineTo(zone.points[i].x * scaleX, zone.points[i].y * scaleY);
                }
                ctx.closePath();

                ctx.fillStyle = zone.is_parking_zone
                    ? "rgba(255, 0, 0, 0.2)"
                    : "rgba(0, 255, 0, 0.2)";
                ctx.fill();

                ctx.strokeStyle = zone.color || (zone.is_parking_zone ? "#FF0000" : "#00FF00");
                ctx.lineWidth = 3;
                ctx.stroke();

                if (showLabels) {
                    ctx.fillStyle = "#FFFFFF";
                    ctx.strokeStyle = "#000000";
                    ctx.lineWidth = 3;
                    ctx.font = "bold 14px Arial";
                    const labelX = zone.points[0].x * scaleX + 5;
                    const labelY = zone.points[0].y * scaleY + 20;
                    ctx.strokeText(zone.name, labelX, labelY);
                    ctx.fillText(zone.name, labelX, labelY);
                }
            }
        }

        if (detections.length > 0) {
            for (const det of detections) {
                const isViolation = showViolations && det.track_id !== null && violationTrackIds.has(det.track_id);
                const color = getColor(det.class_name, isViolation);

                const x1 = det.bbox.x1 * scaleX;
                const y1 = det.bbox.y1 * scaleY;
                const w = (det.bbox.x2 - det.bbox.x1) * scaleX;
                const h = (det.bbox.y2 - det.bbox.y1) * scaleY;

                ctx.strokeStyle = color;
                ctx.lineWidth = isViolation ? 4 : 3;
                ctx.strokeRect(x1, y1, w, h);

                if (showLabels) {
                    const label = det.track_id !== null
                        ? `#${det.track_id} ${det.class_name} ${(det.confidence * 100).toFixed(0)}%`
                        : `${det.class_name} ${(det.confidence * 100).toFixed(0)}%`;

                    ctx.font = "bold 12px Arial";
                    const textWidth = ctx.measureText(label).width;
                    const textHeight = 16;
                    const padding = 4;

                    ctx.fillStyle = color;
                    ctx.fillRect(x1, y1 - textHeight - padding, textWidth + padding * 2, textHeight + padding);

                    ctx.fillStyle = "#000000";
                    ctx.fillText(label, x1 + padding, y1 - padding - 2);
                }

                if (isViolation) {
                    const violation = violations.find((v) => v.track_id === det.track_id);
                    if (violation && showLabels) {
                        const warnText = `⚠ PARKING ${violation.duration_seconds.toFixed(0)}s`;
                        ctx.font = "bold 14px Arial";
                        const warnWidth = ctx.measureText(warnText).width;

                        ctx.fillStyle = "#FF0000";
                        ctx.fillRect(x1, y1 + h + 4, warnWidth + 12, 22);

                        ctx.fillStyle = "#FFFFFF";
                        ctx.fillText(warnText, x1 + 6, y1 + h + 20);
                    }
                }
            }
        }
    }, [detections, zones, violations, scaleX, scaleY, safeContainerWidth, safeContainerHeight, showLabels, showZones, showViolations, violationTrackIds]);

    useEffect(() => {
        draw();
    }, [draw]);

    return (
        <canvas
            ref={canvasRef}
            width={safeContainerWidth}
            height={safeContainerHeight}
            style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
                zIndex: 10,
            }}
        />
    );
}
