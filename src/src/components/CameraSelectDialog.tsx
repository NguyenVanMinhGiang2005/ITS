import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Camera, Trash2, MapPin, Plus } from "lucide-react";
import { ALL_CAMERAS, Camera as CameraType } from "@/data/cam";

interface CameraSelectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCameras: CameraType[];
  onCamerasChange: (cameras: CameraType[]) => void;
}

const CameraSelectDialog = ({
  open,
  onOpenChange,
  selectedCameras,
  onCamerasChange,
}: CameraSelectDialogProps) => {
  const [tempSelected, setTempSelected] = useState<string[]>(
    selectedCameras.map((c) => c.id)
  );

  const handleToggleCamera = (cameraId: string) => {
    setTempSelected((prev) =>
      prev.includes(cameraId)
        ? prev.filter((id) => id !== cameraId)
        : [...prev, cameraId]
    );
  };

  const handleSave = () => {
    const newCameras = ALL_CAMERAS.filter((cam) => tempSelected.includes(cam.id));
    onCamerasChange(newCameras);
    onOpenChange(false);
  };

  const handleRemoveCamera = (cameraId: string) => {
    const newCameras = selectedCameras.filter((cam) => cam.id !== cameraId);
    onCamerasChange(newCameras);
    setTempSelected((prev) => prev.filter((id) => id !== cameraId));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Camera className="w-5 h-5 text-primary" />
            Quản lý Camera
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="select" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-secondary">
            <TabsTrigger 
              value="select" 
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <Plus className="w-4 h-4 mr-2" />
              Chọn Camera
            </TabsTrigger>
            <TabsTrigger 
              value="selected"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <Camera className="w-4 h-4 mr-2" />
              Đã chọn ({selectedCameras.length})
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Chọn camera */}
          <TabsContent value="select" className="mt-4">
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
              {ALL_CAMERAS.map((camera) => (
                <div
                  key={camera.id}
                  className={`flex items-center gap-4 p-3 rounded-lg border transition-all cursor-pointer ${
                    tempSelected.includes(camera.id)
                      ? "border-primary bg-primary/10"
                      : "border-border bg-secondary/50 hover:bg-secondary"
                  }`}
                  onClick={() => handleToggleCamera(camera.id)}
                >
                  <Checkbox
                    checked={tempSelected.includes(camera.id)}
                    onCheckedChange={() => handleToggleCamera(camera.id)}
                    className="border-muted-foreground data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                  />
                  <div className="flex-1">
                    <p className="font-medium text-foreground">{camera.name}</p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="w-3 h-3" />
                      {camera.location}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground font-mono">
                    {camera.id}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="border-border"
              >
                Hủy
              </Button>
              <Button onClick={handleSave} className="bg-primary hover:bg-primary/90">
                Lưu thay đổi
              </Button>
            </div>
          </TabsContent>

          {/* Tab 2: Camera đã chọn */}
          <TabsContent value="selected" className="mt-4">
            {selectedCameras.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Camera className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Chưa có camera nào được chọn</p>
                <p className="text-sm">Chuyển sang tab "Chọn Camera" để thêm</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                {selectedCameras.map((camera) => (
                  <div
                    key={camera.id}
                    className="flex items-center gap-4 p-3 rounded-lg border border-border bg-secondary/50 group"
                  >
                    <div className="w-16 h-10 rounded bg-muted overflow-hidden">
                      <img
                        src={camera.url}
                        alt={camera.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-foreground">{camera.name}</p>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3" />
                        {camera.location}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveCamera(camera.id)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default CameraSelectDialog;
