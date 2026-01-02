// src/components/CameraFeed.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import Hls from "hls.js";
import type { Camera } from "@/lib/api";

type CameraFeedProps = {
  camera: Camera;
  refreshMs?: number;
};

/**
 * FE chạy ở :8080/:5173, backend ở :8000
 * - Ảnh:  /api/proxy/image?url=<encoded>
 * - Video: /api/proxy/hls?url=<encoded>  (playlist + segment sẽ được backend rewrite/proxy)
 *
 * Có thể override bằng env VITE_API_BASE (vd: http://localhost:8000)
 */
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

/**
 * Một số link có dạng ...?videoUrl=<m3u8-url>&...
 * - m3u8 lấy từ videoUrl
 * - ảnh lấy từ URL gốc sau khi xoá param videoUrl
 */
function splitVideoUrl(url: string) {
  try {
    const u = new URL(url);
    const videoUrl = u.searchParams.get("videoUrl");
    if (videoUrl) {
      u.searchParams.delete("videoUrl");
      return { imageUrl: u.toString(), hlsUrl: videoUrl };
    }
  } catch {
    // ignore
  }
  return { imageUrl: url, hlsUrl: null as string | null };
}

export default function CameraFeed({ camera, refreshMs = 12000 }: CameraFeedProps) {
  // Compat: dự án của bạn có thể dùng urlImg hoặc url
  const rawUrl = (camera as any).urlImg ?? (camera as any).url ?? "";
  const { id, name, location } = camera as any;

  const videoRef = useRef<HTMLVideoElement>(null);

  // State để ép render lại ảnh mỗi refreshMs
  const [timestamp, setTimestamp] = useState(Date.now());

  // Clock cập nhật thời gian hiển thị
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  // Refresh ảnh định kỳ (chỉ áp dụng cho image)
  useEffect(() => {
    const interval = window.setInterval(() => setTimestamp(Date.now()), refreshMs);
    return () => window.clearInterval(interval);
  }, [refreshMs]);

  // Phân loại link: image vs m3u8
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

  // URL dùng cho proxy
  const proxiedImageUrl = useMemo(() => {
    if (!imageOriginalUrl || isM3U8) return "";

    // tránh bị ...&t=...&t=...
    const cleaned = stripParam(imageOriginalUrl, "t");
    const withT = setQueryParam(cleaned, "t", String(timestamp));

    return `${API_BASE}/api/proxy/image?url=${encodeURIComponent(withT)}`;
  }, [imageOriginalUrl, isM3U8, timestamp]);

  const proxiedHlsUrl = useMemo(() => {
    if (!hlsOriginalUrl || !isM3U8) return "";
    return `${API_BASE}/api/proxy/hls?url=${encodeURIComponent(hlsOriginalUrl)}`;
  }, [hlsOriginalUrl, isM3U8]);

  // Setup HLS Player (Chỉ khi là .m3u8)
  useEffect(() => {
    let hls: Hls | null = null;

    if (isM3U8 && videoRef.current && proxiedHlsUrl) {
      const video = videoRef.current;

      // Safari/iOS có thể play native
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = proxiedHlsUrl;
        video.play().catch(() => {});
        return;
      }

      if (Hls.isSupported()) {
        hls = new Hls({
          lowLatencyMode: true,
          enableWorker: true,
        });
        hls.loadSource(proxiedHlsUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => {});
        });
      }
    }

    return () => {
      if (hls) hls.destroy();
    };
  }, [proxiedHlsUrl, isM3U8]);

  return (
    <div className="relative bg-camera-bg rounded-lg overflow-hidden border border-border transition-all duration-300 hover:border-primary/50">
      {/* Camera View */}
      <div className="aspect-video bg-black flex items-center justify-center relative">
        {!rawUrl ? (
          <div className="text-sm text-muted-foreground">Chưa có URL camera</div>
        ) : isM3U8 ? (
          /* VIDEO (.m3u8) - qua proxy */
          <video
            ref={videoRef}
            className="h-full w-full object-contain"
            autoPlay
            muted
            playsInline
            controls
          />
        ) : (
          /* IMAGE - qua proxy */
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
      </div>

      {/* Info */}
      <div className="bg-card p-3 border-t border-border">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-sm text-foreground truncate">{name}</h3>
            <p className="text-xs text-muted-foreground truncate">
              {location ? location : `ID: ${id}`}
            </p>
          </div>

          <div className="text-right shrink-0">
            <p className="text-xs text-primary font-mono">{now.toLocaleTimeString("vi-VN")}</p>
            <p className="text-xs text-muted-foreground">{now.toLocaleDateString("vi-VN")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
