from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATA: str = "app\\data\\ITS.link.json"
    API_PREFIX: str = "/api"

settings = Settings()

