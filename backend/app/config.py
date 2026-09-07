from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    db_host: str = "127.0.0.1"
    db_port: int = 3306
    db_name: str = "heladeria_pos_dev"
    db_user: str = "heladeria_pos_app"
    db_password: str = ""
    cookie_secure: bool = False
    session_hours: int = 12
    public_origin: str = "http://localhost:5173"
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[1] / ".env", extra="ignore"
    )


settings = Settings()
