import { useEffect, useRef, useState } from "react";

const BASE =
  "https://giaothong.hochiminhcity.gov.vn/render/ImageHandler.ashx?id=63b65f8dbfd3d90017eaa434";

export default function CameraSnapshotSmooth() {
  const [src, setSrc] = useState(`${BASE}&t=${Date.now()}`);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const refresh = () => {
      const next = `${BASE}&t=${Date.now()}`;
      const img = new Image();
      img.onload = () => setSrc(next);      // chỉ update khi ảnh mới tải xong
      img.src = next;
    };

    refresh();
    timerRef.current = window.setInterval(refresh, 12000);

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  return <img src={src} alt="camera" className="w-full h-full object-cover" />;
}
