from pydantic import BaseModel, Field


class CartItemCreate(BaseModel):
    product_id: int = Field(gt=0)
    quantity: int = Field(gt=0, le=1000)


class CartItemUpdate(BaseModel):
    quantity: int = Field(gt=0, le=1000)


class CartItemResponse(BaseModel):
    product_id: int
    name: str
    unit_price: float
    quantity: int
    line_total: float
