from typing import Literal
from decimal import Decimal
from pydantic import BaseModel, Field, ConfigDict


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class ItemIn(StrictModel):
    productId: str
    size: str = ""
    flavors: list[str] = Field(default_factory=list, max_length=10)
    extras: list[str] = Field(default_factory=list, max_length=20)
    notes: str = Field(default="", max_length=300)
    quantity: int = Field(ge=1, le=99, strict=True)


class OrderIn(StrictModel):
    expectedAccount: str
    items: list[ItemIn] = Field(min_length=1, max_length=50)


class PayIn(StrictModel):
    method: Literal["efectivo", "tarjeta", "transferencia"]
    received: Decimal | None = Field(
        default=None, ge=0, max_digits=12, decimal_places=2
    )
    expectedBalance: Decimal = Field(gt=0, max_digits=12, decimal_places=2)


class StatusIn(StrictModel):
    expectedStatus: Literal[
        "pendiente", "en preparación", "listo para entregar", "entregado"
    ]


class StaffIn(StrictModel):
    userId: str


class LoginIn(StrictModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=256)
