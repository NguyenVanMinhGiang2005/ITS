import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Hls from "hls.js";
import { Button } from "@/components/ui/button";
import type { Camera } from "@/lib/api";

type CameraFeedProps = {
  camera: Camera;
  refreshMs?: number;
};

const API_BASE =
  (import.meta as any)?.env?.VITE_API_BASE?.toString?.() ||
  (import.meta as any)?.env?.VITE_API_URL?.toString?.() ||
  "http://localhost:8000";

function setQueryParam(url: string, key: string, val: string) {
  try {
    const u = new URL(url);
    u.searchParams.set(key, val);
    return u.toString();
  } catch {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}${encodeURIComponent(key)}=${encodeURIComponent(val)}`;
  }
}

function stripParam(url: string, key: string) {
  try {
    const u = new URL(url);
    u.searchParams.delete(key);
    return u.toString();
  } catch {
    return url;
  }
}

function splitVideoUrl(url: string) {
  try {
    const u = new URL(url);
    const videoUrl = u.searchParams.get("videoUrl");
    if (videoUrl) {
      u.searchParams.delete("videoUrl");
      return { imageUrl: u.toString(), hlsUrl: videoUrl };
    }
  } catch { }
  return { imageUrl: url, hlsUrl: null as string | null };
}

export default function CameraFeed({ camera, refreshMs = 12000 }: CameraFeedProps) {
  const navigate = useNavigate();
  const rawUrl = (camera as any).urlImg ?? (camera as any).url ?? "";
  const { id, name, location } = camera as any;

  const videoRef = useRef<HTMLVideoElement>(null);
  const [timestamp, setTimestamp] = useState(Date.now());
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setTimestamp(Date.now()), refreshMs);
    return () => window.clearInterval(interval);
  }, [refreshMs]);

  const { imageOriginalUrl, hlsOriginalUrl, isM3U8 } = useMemo(() => {
    if (!rawUrl) return { imageOriginalUrl: "", hlsOriginalUrl: "", isM3U8: false };

    const { imageUrl, hlsUrl } = splitVideoUrl(rawUrl);
    const isM3u8 =
      !!hlsUrl ||
      rawUrl.toLowerCase().includes(".m3u8") ||
      imageUrl.toLowerCase().includes(".m3u8");

    const hls = hlsUrl ? hlsUrl : isM3u8 ? rawUrl : "";
    return { imageOriginalUrl: imageUrl, hlsOriginalUrl: hls, isM3U8: isM3u8 };
  }, [rawUrl]);

  const proxiedImageUrl = useMemo(() => {
    if (!imageOriginalUrl || isM3U8) return "";
    const cleaned = stripParam(imageOriginalUrl, "t");
    const withT = setQueryParam(cleaned, "t", String(timestamp));
    return `${API_BASE}/api/proxy/image?url=${encodeURIComponent(withT)}`;
  }, [imageOriginalUrl, isM3U8, timestamp]);

  const proxiedHlsUrl = useMemo(() => {
    if (!hlsOriginalUrl || !isM3U8) return "";
    return `${API_BASE}/api/proxy/hls?url=${encodeURIComponent(hlsOriginalUrl)}`;
  }, [hlsOriginalUrl, isM3U8]);

  useEffect(() => {
    let hls: Hls | null = null;

    if (isM3U8 && videoRef.current && proxiedHlsUrl) {
      const video = videoRef.current;

      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = proxiedHlsUrl;
        video.play().catch(() => { });
        return;
      }

      if (Hls.isSupported()) {
        hls = new Hls({ lowLatencyMode: true, enableWorker: true });
        hls.loadSource(proxiedHlsUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => { });
        });
      }
    }

    return () => {
      if (hls) hls.destroy();
    };
  }, [proxiedHlsUrl, isM3U8]);

  const handleOpenDetection = () => {
    const params = new URLSearchParams({
      id: id || "",
      url: rawUrl,
      name: name || "Camera",
    });
    navigate(`/detection?${params.toString()}`);
  };

  return (
    <div className="relative bg-camera-bg rounded-lg overflow-hidden border border-border transition-all duration-300 hover:border-primary/50 group">
      <div className="aspect-video bg-black flex items-center justify-center relative">
        {!rawUrl ? (
          <div className="text-sm text-muted-foreground">Chưa có URL camera</div>
        ) : isM3U8 ? (
          <video
            ref={videoRef}
            className="h-full w-full object-contain"
            autoPlay
            muted
            playsInline
            controls
          />
        ) : (
          <img
            src={proxiedImageUrl}
            alt={name}
            className="h-full w-full object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                "https://via.placeholder.com/640x360?text=Camera+Offline";
            }}
          />
        )}

        <div className="absolute top-2 right-2">
          <Button
            size="sm"
            onClick={handleOpenDetection}
            className="bg-primary/90 hover:bg-primary text-xs shadow-lg"
          >
            🔍 Detect
          </Button>
        </div>
      </div>

      <div className="bg-card p-3 border-t border-border">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-sm text-foreground truncate">{name}</h3>
            <p className="text-xs text-muted-foreground truncate">
              {location ? location : `ID: ${id}`}
            </p>
          </div>

          <Button
            size="sm"
            onClick={handleOpenDetection}
            className="bg-green-600 hover:bg-green-700 text-white text-xs shrink-0"
          >
            🔍 Detect
          </Button>
        </div>
      </div>
    </div>
  );
}
