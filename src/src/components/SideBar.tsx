//src\components\SideBar.tsx
import { Camera, House, Search, LaptopMinimalCheck } from "lucide-react";
import { NavLink } from "react-router-dom";

const menuItem = [
  { icon: <House />, label: "Home", to: "/" },
  { icon: <Search />, label: "Tìm kiếm", to: "/search" },
  { icon: <LaptopMinimalCheck />, label: "Check phạt nguội", to: "test-img" },
];


const SideBar = () => {
  return (
    <aside
      className="
        fixed left-0 top-0 z-40 h-screen w-[220px]
        bg-card/90 border-r border-border
        backdrop-blur-sm
      "
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-4 ">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20">
          <Camera className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Camera</h1>
          <p className="text-xs text-muted-foreground">Theo dõi trực tiếp 24/7</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-2 p-3 overflow-y-auto h-[calc(100vh-80px)]">
        {menuItem.map((item, index) => (
          <NavLink
            to={item.to}
            key={index}
            className="
              flex items-center gap-3
              rounded-lg px-3 py-2
              text-sm text-muted-foreground
              hover:bg-secondary hover:text-foreground
              transition-colors
            ">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary">
              {/* chỗ này sau bạn muốn thêm icon thì nhét vào */}
              <span className="text-xs font-semibold">{item.icon}</span>
            </div>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
};

export default SideBar;
