import CameraGrid from "@/components/CameraGrid";
import SideBar from "@/components/SideBar";
import Header from "@/components/HeaderHome";


const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar cố định bên trái */}
      <SideBar />

      {/* Nội dung chính, đẩy sang phải 220px đúng bằng width sidebar */}
      <main className="ml-[220px] p-0">
        <Header />
        <CameraGrid />
      </main>
    </div>
  );
};

export default Index;
