import os
from pathlib import Path
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    db_host: str = "127.0.0.1"
    db_port: int = 3306
    db_name: str = "heladeria_pos_dev"
    db_user: str = "heladeria_pos_app"
    db_password: str = ""
    database_url: str | None = None
    cookie_secure: bool = False
    session_hours: int = 12
    public_origin: str = "http://localhost:5173"

    @model_validator(mode="before")
    @classmethod
    def apply_fallbacks(cls, data):
        if not isinstance(data, dict):
            return data
        if "db_host" not in data and "MYSQLHOST" in os.environ:
            data["db_host"] = os.environ["MYSQLHOST"]
        if "db_port" not in data and "MYSQLPORT" in os.environ:
            data["db_port"] = int(os.environ["MYSQLPORT"])
        if "db_name" not in data and "MYSQLDATABASE" in os.environ:
            data["db_name"] = os.environ["MYSQLDATABASE"]
        if "db_user" not in data and "MYSQLUSER" in os.environ:
            data["db_user"] = os.environ["MYSQLUSER"]
        if "db_password" not in data and "MYSQLPASSWORD" in os.environ:
            data["db_password"] = os.environ["MYSQLPASSWORD"]
        if "database_url" not in data:
            if "DATABASE_URL" in os.environ:
                data["database_url"] = os.environ["DATABASE_URL"]
            elif "MYSQL_URL" in os.environ:
                data["database_url"] = os.environ["MYSQL_URL"]
        return data

    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[1] / ".env", extra="ignore"
    )


settings = Settings()

