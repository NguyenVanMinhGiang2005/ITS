import { useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import Hls from "hls.js";
import { Button } from "@/components/ui/button";
import DetectionViewer from "@/components/DetectionViewer";
import PolygonEditor from "@/components/PolygonEditor";
import TrafficDashboard from "@/components/TrafficDashboard";
import {
    detectVehicles,
    getZones,
    addZone,
    deleteZone,
    saveZones,
    type DetectionResult,
    type ZonePolygon,
    type ParkingViolation,
} from "@/lib/api";

const API_BASE =
    (import.meta as any)?.env?.VITE_API_BASE?.toString?.() ||
    (import.meta as any)?.env?.VITE_API_URL?.toString?.() ||
    "http://localhost:8000";

const WS_BASE = API_BASE.replace(/^http/, "ws");

export default function DetectionPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const cameraId = searchParams.get("id") || "";
    const cameraUrl = searchParams.get("url") || "";
    const cameraName = searchParams.get("name") || "Camera";

    const containerRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const hlsRef = useRef<Hls | null>(null);
    const wsRef = useRef<WebSocket | null>(null);

    const [containerSize, setContainerSize] = useState({ width: 800, height: 450 });
    const [isDetecting, setIsDetecting] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [showDashboard, setShowDashboard] = useState(true);
    const [debugInfo, setDebugInfo] = useState("");

    const [result, setResult] = useState<DetectionResult | null>(null);
    const [violations, setViolations] = useState<ParkingViolation[]>([]);
    const [zones, setZones] = useState<ZonePolygon[]>([]);
    const [frameSize, setFrameSize] = useState({ width: 1920, height: 1080 });
    const [timestamp, setTimestamp] = useState(Date.now());
    const [syncedFrame, setSyncedFrame] = useState<string | null>(null);

    const detectIntervalRef = useRef<number | null>(null);
    const isM3u8 = cameraUrl.toLowerCase().includes(".m3u8");

    const getProxiedImageUrl = useCallback(() => {
        const cleaned = cameraUrl.replace(/[?&]t=\d+/g, "");
        const sep = cleaned.includes("?") ? "&" : "?";
        return `${API_BASE}/api/proxy/image?url=${encodeURIComponent(`${cleaned}${sep}t=${timestamp}`)}`;
    }, [cameraUrl, timestamp]);

    const getProxiedHlsUrl = useCallback(() => {
        return `${API_BASE}/api/proxy/hls?url=${encodeURIComponent(cameraUrl)}`;
    }, [cameraUrl]);

    useEffect(() => {
        if (!cameraId) return;
        getZones(cameraId).then((data) => setZones(data.zones || [])).catch(console.error);
    }, [cameraId]);

    useEffect(() => {
        if (!isM3u8) {
            const interval = setInterval(() => setTimestamp(Date.now()), 12000);
            return () => clearInterval(interval);
        }
    }, [isM3u8]);

    useEffect(() => {
        const updateSize = () => {
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                setContainerSize({ width: rect.width, height: rect.height });
                console.log("Container size:", rect.width, rect.height);
            }
        };
        updateSize();
        window.addEventListener("resize", updateSize);
        return () => window.removeEventListener("resize", updateSize);
    }, []);

    useEffect(() => {
        if (!isM3u8 || !videoRef.current) return;
        if (isDetecting && syncedFrame) return;

        const video = videoRef.current;
        const hlsUrl = getProxiedHlsUrl();
        console.log("Loading HLS:", hlsUrl);

        if (video.canPlayType("application/vnd.apple.mpegurl")) {
            video.src = hlsUrl;
            video.play().catch(() => { });
            return;
        }

        if (Hls.isSupported()) {
            if (hlsRef.current) {
                hlsRef.current.destroy();
            }
            const hls = new Hls({ lowLatencyMode: true, enableWorker: true });
            hls.loadSource(hlsUrl);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => { }));
            hlsRef.current = hls;
        }

        return () => {
            if (hlsRef.current) {
                hlsRef.current.destroy();
                hlsRef.current = null;
            }
        };
    }, [isM3u8, getProxiedHlsUrl, isDetecting, syncedFrame]);

    const captureVideoFrame = useCallback((): string | null => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || video.readyState < 2) {
            console.log("Video not ready:", video?.readyState);
            return null;
        }

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;

        ctx.drawImage(video, 0, 0);
        console.log("Captured frame:", video.videoWidth, video.videoHeight);
        setFrameSize({ width: video.videoWidth, height: video.videoHeight });
        return canvas.toDataURL("image/jpeg", 0.7);
    }, []);

    const runDetectionForImage = useCallback(async () => {
        if (!cameraUrl || !cameraId) return;

        const cleaned = cameraUrl.replace(/[?&]t=\d+/g, "");
        const sep = cleaned.includes("?") ? "&" : "?";
        const urlWithT = `${cleaned}${sep}t=${Date.now()}`;
        console.log("Detecting image:", urlWithT);

        try {
            const response = await detectVehicles(urlWithT, cameraId, true);
            console.log("Detection response:", response);
            if (response.success && response.result) {
                setResult(response.result);
                setViolations(response.violations || []);
                setFrameSize({ width: response.result.frame_width, height: response.result.frame_height });
                setDebugInfo(`Detected: ${response.result.total_count} vehicles`);
            } else {
                setDebugInfo(`Error: ${response.error || "No result"}`);
            }
        } catch (e: any) {
            console.error("Detection failed:", e);
            setDebugInfo(`Error: ${e.message}`);
        }
    }, [cameraUrl, cameraId]);

    const runDetectionForVideo = useCallback(async () => {
        if (!cameraId || !cameraUrl) return;

        console.log("Detecting from video URL:", cameraUrl);
        setDebugInfo("Detecting from video...");

        try {
            const response = await fetch(`${API_BASE}/api/detection/detect-video`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    video_url: cameraUrl,
                    camera_id: cameraId,
                    include_zones: true,
                }),
            });
            const data = await response.json();
            console.log("Video detection response:", data);
            if (data.success && data.result) {
                setResult(data.result);
                setViolations(data.violations || []);
                setFrameSize({ width: data.result.frame_width, height: data.result.frame_height });
                setDebugInfo(`Detected: ${data.result.total_count} vehicles (${data.result.processing_time_ms.toFixed(0)}ms)`);
            } else {
                setDebugInfo(`Error: ${data.error || "No result"}`);
            }
        } catch (e: any) {
            console.error("Video detection failed:", e);
            setDebugInfo(`Error: ${e.message}`);
        }
    }, [cameraId, cameraUrl]);

    useEffect(() => {
        if (isDetecting) {
            if (isM3u8) {
                const ws = new WebSocket(`${WS_BASE}/api/detection/video-stream/${encodeURIComponent(cameraId)}`);
                wsRef.current = ws;

                ws.onopen = () => {
                    console.log("WebSocket connected");
                    setDebugInfo("Connecting to video stream...");
                    ws.send(JSON.stringify({ video_url: cameraUrl, send_frame: true }));
                };

                ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        if (data.type === "detection_result") {
                            setResult(data.result);
                            setViolations(data.violations || []);
                            setFrameSize({
                                width: data.result.frame_width,
                                height: data.result.frame_height
                            });
                            setDebugInfo(`${data.result.total_count} vehicles (${data.result.processing_time_ms.toFixed(0)}ms)`);

                            if (data.frame) {
                                setSyncedFrame(data.frame);
                            }
                        } else if (data.type === "connected") {
                            setDebugInfo("Video stream connected!");
                        } else if (data.type === "error") {
                            setDebugInfo(`Error: ${data.error}`);
                        }
                    } catch (e) {
                        console.error("WS message parse error:", e);
                    }
                };

                ws.onerror = () => setDebugInfo("WebSocket error");
                ws.onclose = () => console.log("WebSocket closed");
            } else {
                runDetectionForImage();
                detectIntervalRef.current = window.setInterval(runDetectionForImage, 3000);
            }
        } else {
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
            if (detectIntervalRef.current) {
                clearInterval(detectIntervalRef.current);
                detectIntervalRef.current = null;
            }
            setResult(null);
            setSyncedFrame(null);
        }

        return () => {
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
            if (detectIntervalRef.current) clearInterval(detectIntervalRef.current);
        };
    }, [isDetecting, isM3u8, cameraId, cameraUrl, runDetectionForImage]);

    const handleVideoLoad = useCallback(() => {
        const video = videoRef.current;
        if (video) {
            console.log("Video loaded:", video.videoWidth, video.videoHeight);
            setFrameSize({ width: video.videoWidth || 1920, height: video.videoHeight || 1080 });
        }
    }, []);

    const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
        const img = e.currentTarget;
        console.log("Image loaded:", img.naturalWidth, img.naturalHeight);
        setFrameSize({ width: img.naturalWidth, height: img.naturalHeight });
    }, []);

    const handleZoneAdd = useCallback(async (zone: ZonePolygon) => {
        if (!cameraId) return;
        const response = await addZone(cameraId, zone);
        if (response.success) setZones(response.zones);
    }, [cameraId]);

    const handleZoneDelete = useCallback(async (zoneId: string) => {
        if (!cameraId) return;
        const response = await deleteZone(cameraId, zoneId);
        if (response.success) setZones(response.zones);
    }, [cameraId]);

    const handleZonesClear = useCallback(async () => {
        if (!cameraId) return;
        await saveZones(cameraId, []);
        setZones([]);
    }, [cameraId]);

    const handleZoneUpdate = useCallback(async (updatedZone: ZonePolygon) => {
        if (!cameraId) return;
        const newZones = zones.map(z => z.id === updatedZone.id ? updatedZone : z);
        await saveZones(cameraId, newZones);
        setZones(newZones);

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "update_zones" }));
        }
    }, [cameraId, zones]);

    if (!cameraUrl) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="text-center">
                    <h1 className="text-2xl font-bold mb-4">No Camera Selected</h1>
                    <Button onClick={() => navigate("/")}>Go Back</Button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            <header className="bg-card border-b border-border p-4">
                <div className="flex items-center gap-4 flex-wrap">
                    <Button variant="outline" size="sm" onClick={() => navigate("/")}>← Back</Button>
                    <h1 className="text-xl font-bold">{cameraName}</h1>
                    <span className="text-xs text-muted-foreground px-2 py-1 bg-muted rounded">
                        {isM3u8 ? "🎥 Live Stream" : "📷 Snapshot"}
                    </span>
                    <span className="text-xs text-green-500">{frameSize.width}x{frameSize.height}</span>
                    <div className="flex-1" />
                    <Button
                        variant={isDetecting ? "destructive" : "default"}
                        onClick={() => setIsDetecting(!isDetecting)}
                        disabled={isEditing}
                        className={isDetecting ? "" : "bg-green-600 hover:bg-green-700"}
                    >
                        {isDetecting ? "⏹ Stop" : "▶ Start Detection"}
                    </Button>
                    <Button variant="outline" onClick={() => setShowDashboard(!showDashboard)}>
                        {showDashboard ? "Hide Stats" : "Stats"}
                    </Button>
                </div>
            </header>

            <div className="flex p-4 gap-4">
                <div className="flex-1">
                    <div
                        ref={containerRef}
                        className="relative bg-black rounded-lg overflow-hidden"
                        style={{ aspectRatio: "16/9" }}
                    >
                        {isM3u8 ? (
                            isDetecting && syncedFrame ? (
                                <img
                                    src={syncedFrame}
                                    alt="Detection Stream"
                                    className="absolute inset-0 w-full h-full object-contain"
                                />
                            ) : (
                                <video
                                    ref={videoRef}
                                    className="absolute inset-0 w-full h-full object-contain"
                                    autoPlay
                                    muted
                                    playsInline
                                    crossOrigin="anonymous"
                                    onLoadedMetadata={handleVideoLoad}
                                />
                            )
                        ) : (
                            <img
                                src={getProxiedImageUrl()}
                                alt={cameraName}
                                className="absolute inset-0 w-full h-full object-contain"
                                onLoad={handleImageLoad}
                                crossOrigin="anonymous"
                                onError={(e) => {
                                    (e.target as HTMLImageElement).src = "https://via.placeholder.com/640x360?text=Camera+Offline";
                                }}
                            />
                        )}

                        <canvas ref={canvasRef} style={{ display: "none" }} />

                        {isDetecting && result && !isEditing && !syncedFrame && (
                            <DetectionViewer
                                detections={result.detections}
                                zones={zones}
                                violations={violations}
                                frameWidth={frameSize.width}
                                frameHeight={frameSize.height}
                                containerWidth={containerSize.width}
                                containerHeight={containerSize.height}
                            />
                        )}

                        <PolygonEditor
                            zones={zones}
                            frameWidth={frameSize.width}
                            frameHeight={frameSize.height}
                            containerWidth={containerSize.width}
                            containerHeight={containerSize.height}
                            onZoneAdd={handleZoneAdd}
                            onZoneDelete={handleZoneDelete}
                            onZonesClear={handleZonesClear}
                            isEditing={isEditing}
                            onEditingChange={setIsEditing}
                        />

                        {isDetecting && (
                            <div className="absolute top-2 left-2 bg-black/80 text-white text-xs px-3 py-2 rounded flex items-center gap-2 z-50">
                                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                                {debugInfo || "Starting..."}
                            </div>
                        )}
                    </div>
                </div>

                {showDashboard && (
                    <div className="w-80 shrink-0">
                        <TrafficDashboard
                            result={result}
                            violations={violations}
                            zones={zones}
                            isConnected={isDetecting}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
