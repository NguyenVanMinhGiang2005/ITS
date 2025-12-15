// src\components\CameraFeed.tsx
import { useEffect, useState, useRef } from "react";

interface CameraFeedProps {
  cameraId: string;
  cameraName: string;
  url: string;
}

const CameraFeed = ({ cameraId, cameraName, url }: CameraFeedProps) => {
  const x = false

  // Thời gian 
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000); // cập nhật mỗi giây
    return () => clearInterval(id);
  }, []);

  // update hình ảnh sau 12s dcmmm m Lâm ơi 
  const [src, setSrc] = useState(`${url}&t=${Date.now()}`);
  const timerRef = useRef<number | null>(null);
  useEffect(()=>{
    const refresh = () => {
      const next = `${url}&t=${Date.now()}`;
      const img = new Image();
      img.onload = () => setSrc(next);
      img.src = next;
    };

    refresh();
    timerRef.current = window.setInterval(refresh, 12000);

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  return (
    <div
      className={`relative bg-camera-bg rounded-lg overflow-hidden border border-border transition-all duration-300 hover:border-primary/50 ${
        x ? "fixed inset-4 z-50" : ""
      }`}
    >
      {/* Camera View */}
      <div className="aspect-video bg-gradient-to-br from-secondary to-camera-bg flex items-center justify-center relative group">
        <img src = {src} className="w-full h-full object-cover"/>
      </div>

      {/* thông tin IdCamera + cameraName */}
      <div className="bg-card p-3 border-t border-border">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm text-foreground">{cameraName}</h3>
            <p className="text-xs text-muted-foreground">ID: {cameraId}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-primary font-mono">
              {now.toLocaleTimeString("vi-VN")}
            </p>
            <p className="text-xs text-muted-foreground">
              {new Date().toLocaleDateString('vi-VN')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CameraFeed;
