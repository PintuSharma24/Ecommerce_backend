from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from db_conn import get_db
from dependencies import get_current_admin, get_current_user
from models.cart_item import CartItem
from models.order import Order
from models.order_item import OrderItem
from models.product import Product
from models.user import User
from schemas.order_schema import OrderCreate, OrderResponse, OrderStatusUpdate


router = APIRouter(prefix="/orders", tags=["Orders"])

ORDER_TRANSITIONS = {
    "pending": "processing",
    "processing": "shipped",
    "shipped": "delivered",
}


def _order_response(db: Session, order: Order) -> dict:
    items = db.query(OrderItem).filter(OrderItem.order_id == order.id).all()
    return {
        "id": order.id,
        "user_id": order.user_id,
        "total_amount": order.total_amount,
        "status": order.status,
        "created_at": order.created_at,
        "items": items,
    }


def _get_order(
    db: Session, order_id: int, current_user: User, lock: bool = False
) -> Order:
    query = db.query(Order).filter(Order.id == order_id)
    if lock:
        query = query.with_for_update()
    order = query.first()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    if current_user.role != "admin" and order.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


def _place_order(
    db: Session,
    user_id: int,
    requested_quantities: dict[int, int],
    clear_cart: bool = False,
) -> dict:
    if not requested_quantities:
        raise HTTPException(status_code=400, detail="Cannot create an empty order")
    products = (
        db.query(Product)
        .filter(Product.id.in_(requested_quantities))
        .order_by(Product.id)
        .with_for_update()
        .all()
    )
    products_by_id = {product.id: product for product in products}
    missing_ids = set(requested_quantities) - products_by_id.keys()
    if missing_ids:
        raise HTTPException(
            status_code=404,
            detail=f"Product {min(missing_ids)} not found",
        )
    for product in products:
        if product.stock < requested_quantities[product.id]:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Not enough stock for {product.name}",
            )

    order = Order(user_id=user_id, total_amount=0, status="pending")
    db.add(order)
    db.flush()
    total_amount = 0.0
    for product_id, quantity in requested_quantities.items():
        product = products_by_id[product_id]
        total_amount += product.price * quantity
        product.stock -= quantity
        db.add(
            OrderItem(
                order_id=order.id,
                product_id=product.id,
                quantity=quantity,
                price=product.price,
            )
        )
    order.total_amount = total_amount
    if clear_cart:
        db.query(CartItem).filter(CartItem.user_id == user_id).delete()
    db.commit()
    db.refresh(order)
    return _order_response(db, order)


@router.post(
    "/",
    response_model=OrderResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_order(
    request: OrderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    requested_quantities = {item.product_id: item.quantity for item in request.items}
    return _place_order(db, current_user.id, requested_quantities)


@router.post(
    "/checkout",
    response_model=OrderResponse,
    status_code=status.HTTP_201_CREATED,
)
def checkout_cart(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cart_items = (
        db.query(CartItem)
        .filter(CartItem.user_id == current_user.id)
        .all()
    )
    requested_quantities = {
        item.product_id: item.quantity for item in cart_items
    }
    return _place_order(
        db,
        current_user.id,
        requested_quantities,
        clear_cart=True,
    )


@router.get("/", response_model=list[OrderResponse])
def list_orders(
    skip: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if skip < 0 or not 1 <= limit <= 100:
        raise HTTPException(status_code=422, detail="Invalid pagination parameters")
    query = db.query(Order)
    if current_user.role != "admin":
        query = query.filter(Order.user_id == current_user.id)
    orders = query.order_by(Order.id.desc()).offset(skip).limit(limit).all()
    return [_order_response(db, order) for order in orders]


@router.get("/{order_id}", response_model=OrderResponse)
def get_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _order_response(db, _get_order(db, order_id, current_user))


@router.post("/{order_id}/cancel", response_model=OrderResponse)
def cancel_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    order = _get_order(db, order_id, current_user, lock=True)
    if order.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only pending orders can be cancelled",
        )
    items = db.query(OrderItem).filter(OrderItem.order_id == order.id).all()
    products = {
        product.id: product
        for product in db.query(Product)
        .filter(Product.id.in_([item.product_id for item in items]))
        .order_by(Product.id)
        .with_for_update()
        .all()
    }
    for item in items:
        products[item.product_id].stock += item.quantity
    order.status = "cancelled"
    db.commit()
    db.refresh(order)
    return _order_response(db, order)


@router.patch("/{order_id}/status", response_model=OrderResponse)
def update_order_status(
    order_id: int,
    changes: OrderStatusUpdate,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    order = db.query(Order).filter(Order.id == order_id).with_for_update().first()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    expected_status = ORDER_TRANSITIONS.get(order.status)
    if expected_status != changes.status:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot change order status from {order.status} to {changes.status}",
        )
    order.status = changes.status
    db.commit()
    db.refresh(order)
    return _order_response(db, order)
