import { Camera, House, Search, LaptopMinimalCheck } from "lucide-react";
import { NavLink } from "react-router-dom";

const menuItem = [
  { icon: <House className="h-4 w-4" />, label: "Home", to: "/" },
  { icon: <LaptopMinimalCheck className="h-4 w-4" />, label: "Test", to: "/test-img" },
];

const HeaderSearch = () => {
  return (
    <header
      className="
        fixed left-0 top-0 z-40 h-[64px] w-full
        bg-card/90 border-b border-border
        backdrop-blur-sm
      "
    >
      <div className="h-full px-4 flex items-center">
        {/* Logo */}
        <div className="flex items-center gap-3 mr-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20">
            <Camera className="h-6 w-6 text-primary" />
          </div>
          <div className="leading-tight">
            <h1 className="text-lg font-semibold text-foreground">Camera</h1>
            <p className="text-xs text-muted-foreground">Theo dõi trực tiếp 24/7</p>
          </div>
        </div>

        {/* Navigation ngang */}
        <nav className="flex items-center gap-2">
          {menuItem.map((item, index) => (
            <NavLink
              key={index}
              to={item.to}
              className="
                flex items-center gap-2
                rounded-lg px-3 py-2
                text-sm text-muted-foreground
                hover:bg-secondary hover:text-foreground
                transition-colors
              "
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary">
                {item.icon}
              </span>
              <span className="hidden sm:inline">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
};

export default HeaderSearch;
