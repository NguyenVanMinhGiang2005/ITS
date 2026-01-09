# from pydantic_settings import BaseSettings
# import os

# class Settings(BaseSettings):
#     DATA: str = "app\\data\\ITS.link.json"
#     API_PREFIX: str = "/api"
#     YOLO_MODEL_PATH: str = "app\\preTrainedModels\\yolov12x.pt"
#     ZONES_DIR: str = "app\\data\\zones"
#     PARKING_VIOLATION_THRESHOLD: int = 10

# settings = Settings()

# os.makedirs(os.path.join(os.path.dirname(__file__), "..", "data", "zones"), exist_ok=True)

from pydantic_settings import BaseSettings
import os


def _norm(p: str) -> str:
    return os.path.normpath(p)


class Settings(BaseSettings):
    DATA: str = _norm("app/data/ITS.link.json")
    API_PREFIX: str = "/api"

    YOLO_MODEL_PATH: str = _norm("app/preTrainedModels/yolov12x.pt")
    ZONES_DIR: str = _norm("app/data/zones")

    PARKING_VIOLATION_THRESHOLD: int = 10

    UPLOAD_DIR: str = _norm("app/tmp/uploads")
    OUTPUT_DIR: str = _norm("app/tmp/outputs")
    JOB_TTL_SECONDS: int = 3600


settings = Settings()


def _ensure_dir(path: str) -> None:
    p = _norm(path)
    if not os.path.isabs(p):
        p = os.path.normpath(os.path.join(os.getcwd(), p))
    os.makedirs(p, exist_ok=True)


_ensure_dir(settings.ZONES_DIR)
_ensure_dir(settings.UPLOAD_DIR)
_ensure_dir(settings.OUTPUT_DIR)
