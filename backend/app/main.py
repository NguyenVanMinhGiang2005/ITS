from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.routes.camera_routes import router as camera_router
from app.routes.detection_routes import router as detection_router
from app.routes.proxy_routes import router as proxy_router

app = FastAPI(
    title="ITS - Intelligent Transport System",
    description="Vehicle Detection & Monitoring API",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
def health():
    return {"ok": True, "service": "ITS Detection API"}

app.include_router(camera_router, prefix=settings.API_PREFIX)
app.include_router(detection_router, prefix=settings.API_PREFIX)
app.include_router(proxy_router, prefix=settings.API_PREFIX)
