from pydantic_settings import BaseSettings
import os

class Settings(BaseSettings):
    DATA: str = "app\\data\\ITS.link.json"
    API_PREFIX: str = "/api"
    YOLO_MODEL_PATH: str = "app\\preTrainedModels\\yolov12x.pt"
    ZONES_DIR: str = "app\\data\\zones"
    PARKING_VIOLATION_THRESHOLD: int = 10

settings = Settings()

os.makedirs(os.path.join(os.path.dirname(__file__), "..", "data", "zones"), exist_ok=True)
