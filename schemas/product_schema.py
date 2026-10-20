from pydantic import BaseModel, ConfigDict, Field, field_validator


class ProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    price: float = Field(gt=0, allow_inf_nan=False)
    stock: int = Field(ge=0)
    category_id: int = Field(gt=0)

    @field_validator("name")
    @classmethod
    def strip_nonempty_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Product name cannot be blank")
        return value


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    price: float | None = Field(default=None, gt=0, allow_inf_nan=False)
    stock: int | None = Field(default=None, ge=0)
    category_id: int | None = Field(default=None, gt=0)

    @field_validator("name")
    @classmethod
    def strip_nonempty_name(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("Product name cannot be blank")
        return value


class ProductResponse(BaseModel):
    id: int
    name: str
    description: str | None = None
    price: float
    stock: int
    category_id: int

    model_config = ConfigDict(from_attributes=True)
