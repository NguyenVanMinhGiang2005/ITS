import { useState } from "react";
import CameraGrid from "@/components/CameraGrid";
import SideBar from "@/components/SideBar";
import Header from "@/components/HeaderHome";
import CameraSelectDialog from "@/components/CameraSelectDialog";
import { CAMERAS, Camera } from "@/data/cam";

const Index = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCameras, setSelectedCameras] = useState<Camera[]>(CAMERAS);

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar cố định bên trái */}
      <SideBar />

      {/* Nội dung chính, đẩy sang phải 220px đúng bằng width sidebar */}
      <main className="ml-[220px] p-0">
        <Header onAddCamera={() => setDialogOpen(true)} />
        <CameraGrid cameras={selectedCameras} />
      </main>

      <CameraSelectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        selectedCameras={selectedCameras}
        onCamerasChange={setSelectedCameras}
      />
    </div>
  );
};

export default Index;
