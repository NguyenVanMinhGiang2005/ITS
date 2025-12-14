import CameraFeed from "./CameraFeed";
import { CAMERAS } from "../data/cam";

const CameraGrid = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
      {CAMERAS.map((camera) => (
        <CameraFeed
          key={camera.id}
          cameraId={camera.id}
          cameraName={camera.name}
          urlImg={camera.imageUrl}
        />
      ))}
    </div>
  );
};

export default CameraGrid;
