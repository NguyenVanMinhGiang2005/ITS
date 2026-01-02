import { useState, useEffect } from "react";
import type { DetectionResult, ParkingViolation, ZonePolygon } from "@/lib/api";

interface TrafficDashboardProps {
    result: DetectionResult | null;
    violations: ParkingViolation[];
    zones: ZonePolygon[];
    isConnected: boolean;
}

const VEHICLE_ICONS: Record<string, string> = {
    car: "🚗",
    motorcycle: "🏍️",
    bus: "🚌",
    truck: "🚛",
    bicycle: "🚲",
    person: "🚶",
};

const VEHICLE_COLORS: Record<string, string> = {
    car: "bg-green-500",
    motorcycle: "bg-yellow-500",
    bus: "bg-orange-500",
    truck: "bg-purple-500",
    bicycle: "bg-cyan-500",
    person: "bg-blue-500",
};

export default function TrafficDashboard({
    result,
    violations,
    zones,
    isConnected,
}: TrafficDashboardProps) {
    const [history, setHistory] = useState<{ time: string; count: number }[]>([]);

    useEffect(() => {
        if (result && result.total_count > 0) {
            const now = new Date().toLocaleTimeString("vi-VN", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
            });
            setHistory((prev) => {
                const updated = [...prev, { time: now, count: result.total_count }];
                return updated.slice(-20);
            });
        }
    }, [result]);

    const maxCount = Math.max(...history.map((h) => h.count), 1);

    return (
        <div className="bg-card border border-border rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg text-foreground">Traffic Analytics</h3>
                <div className="flex items-center gap-2">
                    <div
                        className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"
                            }`}
                    />
                    <span className="text-xs text-muted-foreground">
                        {isConnected ? "Live" : "Offline"}
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div className="bg-primary/10 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-primary">
                        {result?.total_count ?? 0}
                    </div>
                    <div className="text-xs text-muted-foreground">Total Vehicles</div>
                </div>

                <div className="bg-red-500/10 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-red-500">
                        {violations.length}
                    </div>
                    <div className="text-xs text-muted-foreground">Violations</div>
                </div>

                <div className="bg-blue-500/10 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-blue-500">{zones.length}</div>
                    <div className="text-xs text-muted-foreground">Active Zones</div>
                </div>
            </div>

            {result && Object.keys(result.vehicle_count).length > 0 && (
                <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-foreground">By Type</h4>
                    <div className="grid grid-cols-2 gap-2">
                        {Object.entries(result.vehicle_count).map(([type, count]) => (
                            <div
                                key={type}
                                className="flex items-center gap-2 bg-muted/50 rounded p-2"
                            >
                                <span className="text-lg">{VEHICLE_ICONS[type] ?? "🚙"}</span>
                                <div className="flex-1">
                                    <div className="text-sm font-medium capitalize">{type}</div>
                                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                        <div
                                            className={`h-full ${VEHICLE_COLORS[type] ?? "bg-gray-500"}`}
                                            style={{
                                                width: `${(count / result.total_count) * 100}%`,
                                            }}
                                        />
                                    </div>
                                </div>
                                <span className="text-lg font-bold">{count}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {history.length > 1 && (
                <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-foreground">
                        Vehicle Count Trend
                    </h4>
                    <div className="h-20 flex items-end gap-1">
                        {history.map((h, i) => (
                            <div
                                key={i}
                                className="flex-1 bg-primary/70 rounded-t transition-all duration-300"
                                style={{ height: `${(h.count / maxCount) * 100}%` }}
                                title={`${h.time}: ${h.count}`}
                            />
                        ))}
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{history[0]?.time}</span>
                        <span>{history[history.length - 1]?.time}</span>
                    </div>
                </div>
            )}

            {violations.length > 0 && (
                <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-red-500">
                        ⚠ Parking Violations
                    </h4>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                        {violations.map((v, i) => (
                            <div
                                key={i}
                                className="flex items-center gap-2 bg-red-500/10 rounded p-2 text-xs"
                            >
                                <span className="text-red-500 font-bold">#{v.track_id}</span>
                                <span className="capitalize">{v.vehicle_class}</span>
                                <span className="text-muted-foreground">in</span>
                                <span className="font-medium">{v.zone_name}</span>
                                <span className="ml-auto text-red-500 font-bold">
                                    {v.duration_seconds.toFixed(0)}s
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {result && (
                <div className="text-xs text-muted-foreground text-right">
                    Processing: {result.processing_time_ms.toFixed(0)}ms
                </div>
            )}
        </div>
    );
}
