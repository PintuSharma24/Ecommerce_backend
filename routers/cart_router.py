from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from db_conn import get_db
from dependencies import get_current_user
from models.cart_item import CartItem
from models.product import Product
from models.user import User
from schemas.cart_schema import CartItemCreate, CartItemResponse, CartItemUpdate


router = APIRouter(prefix="/cart", tags=["Cart"])


def _cart_item_response(item: CartItem, product: Product) -> dict:
    return {
        "product_id": product.id,
        "name": product.name,
        "unit_price": product.price,
        "quantity": item.quantity,
        "line_total": product.price * item.quantity,
    }


@router.get("/", response_model=list[CartItemResponse])
def get_cart(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        db.query(CartItem, Product)
        .join(Product, Product.id == CartItem.product_id)
        .filter(CartItem.user_id == current_user.id)
        .order_by(CartItem.id)
        .all()
    )
    return [_cart_item_response(item, product) for item, product in rows]


@router.post(
    "/items",
    response_model=CartItemResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_to_cart(
    request: CartItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    product = (
        db.query(Product)
        .filter(Product.id == request.product_id)
        .with_for_update()
        .first()
    )
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    item = (
        db.query(CartItem)
        .filter(
            CartItem.user_id == current_user.id,
            CartItem.product_id == product.id,
        )
        .first()
    )
    new_quantity = request.quantity + (item.quantity if item else 0)
    if new_quantity > product.stock:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Only {product.stock} units of {product.name} are available",
        )
    if item is None:
        item = CartItem(
            user_id=current_user.id,
            product_id=product.id,
            quantity=new_quantity,
        )
        db.add(item)
    else:
        item.quantity = new_quantity
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cart item changed concurrently; retry the request",
        )
    db.refresh(item)
    return _cart_item_response(item, product)


@router.patch("/items/{product_id}", response_model=CartItemResponse)
def update_cart_item(
    product_id: int,
    changes: CartItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    item = (
        db.query(CartItem)
        .filter(
            CartItem.user_id == current_user.id,
            CartItem.product_id == product_id,
        )
        .first()
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Cart item not found")
    if changes.quantity > product.stock:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Only {product.stock} units of {product.name} are available",
        )
    item.quantity = changes.quantity
    db.commit()
    db.refresh(item)
    return _cart_item_response(item, product)


@router.delete("/items/{product_id}")
def remove_cart_item(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = (
        db.query(CartItem)
        .filter(
            CartItem.user_id == current_user.id,
            CartItem.product_id == product_id,
        )
        .first()
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Cart item not found")
    db.delete(item)
    db.commit()
    return {"message": "Cart item removed"}


@router.delete("/")
def clear_cart(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db.query(CartItem).filter(CartItem.user_id == current_user.id).delete()
    db.commit()
    return {"message": "Cart cleared"}
