from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from db_conn import get_db
from dependencies import get_current_admin
from models.cart_item import CartItem
from models.category import Category
from models.order_item import OrderItem
from models.product import Product
from models.user import User
from schemas.product_schema import ProductCreate, ProductResponse, ProductUpdate


router = APIRouter(prefix="/products", tags=["Products"])


@router.post(
    "/",
    response_model=ProductResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_product(
    product: ProductCreate,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    if db.query(Category.id).filter(Category.id == product.category_id).first() is None:
        raise HTTPException(status_code=404, detail="Category not found")
    new_product = Product(**product.model_dump())
    db.add(new_product)
    db.commit()
    db.refresh(new_product)
    return new_product


@router.get("/", response_model=list[ProductResponse])
def get_products(
    q: str | None = None,
    category_id: int | None = Query(default=None, gt=0),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = db.query(Product)
    if q:
        query = query.filter(Product.name.ilike(f"%{q.strip()}%"))
    if category_id is not None:
        query = query.filter(Product.category_id == category_id)
    return query.order_by(Product.id).offset(skip).limit(limit).all()


@router.get("/{product_id}", response_model=ProductResponse)
def get_product(product_id: int, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.id == product_id).first()
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.put("/{product_id}", response_model=ProductResponse)
def update_product(
    product_id: int,
    changes: ProductCreate,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    if db.query(Category.id).filter(Category.id == changes.category_id).first() is None:
        raise HTTPException(status_code=404, detail="Category not found")
    for field, value in changes.model_dump().items():
        setattr(product, field, value)
    db.commit()
    db.refresh(product)
    return product


@router.patch("/{product_id}", response_model=ProductResponse)
def partially_update_product(
    product_id: int,
    changes: ProductUpdate,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    updates = changes.model_dump(exclude_unset=True)
    if "category_id" in updates and db.query(Category.id).filter(
        Category.id == updates["category_id"]
    ).first() is None:
        raise HTTPException(status_code=404, detail="Category not found")
    for field, value in updates.items():
        setattr(product, field, value)
    db.commit()
    db.refresh(product)
    return product


@router.delete("/{product_id}")
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    if db.query(OrderItem.id).filter(OrderItem.product_id == product_id).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Product has order history and cannot be deleted",
        )
    if db.query(CartItem.id).filter(CartItem.product_id == product_id).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Product is in a customer cart and cannot be deleted",
        )
    db.delete(product)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Product is referenced by an order or cart and cannot be deleted",
        )
    return {"message": "Product deleted successfully"}
