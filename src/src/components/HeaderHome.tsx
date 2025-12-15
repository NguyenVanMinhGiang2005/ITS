// src\components\HeaderHome.tsx
import {Shield,Camera}  from "lucide-react"

interface HeaderProps {
  onAddCamera: () => void;
}

const Header = ({onAddCamera}:HeaderProps )=>{
  
  return(
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-40">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <Shield className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Hệ Thống Camera Giám Sát</h1>
              <p className="text-sm text-muted-foreground">Theo dõi trực tiếp 24/7</p>
            </div>
          </div>
          
          <button onClick={onAddCamera}
            className="flex items-center 
            gap-2 bg-status-active/10 px-4 py-2 
            rounded-lg border border-status-active/20 hover:ring-1 hover:ring-status-active/30
            transition-colors">
            <Camera className="w-4 h-4 text-status-active" />
            <span className="text-sm font-medium text-foreground">+ thêm Camera</span>
          </button>
        </div>
      </div>
    </header>
  )
}

export default Header