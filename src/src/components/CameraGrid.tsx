import CameraFeed from "./CameraFeed";
import { Camera } from "@/data/cam";

interface CameraGridProps {
  cameras: Camera[];
}

const CameraGrid = ({ cameras }: CameraGridProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
      {cameras.map((camera) => (
        <CameraFeed
          key={camera.id}
          cameraId={camera.id}
          cameraName={camera.location}
          url={camera.url}
        />
      ))}
    </div>
  );
};

export default CameraGrid;
