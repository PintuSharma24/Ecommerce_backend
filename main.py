from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.orm import Session

from db_conn import get_db
from dependencies import get_current_user
from models.user import User
from routers.auth_router import router as auth_router
from routers.cart_router import router as cart_router
from routers.category_router import router as category_router
from routers.order_router import router as order_router
from routers.product_router import router as product_router
from utils.jwt import validate_auth_config


@asynccontextmanager
async def lifespan(_app: FastAPI):
    validate_auth_config()
    yield


app = FastAPI(
    title="E-Commerce API",
    description=(
        "REST API for customer accounts, product catalog, categories, "
        "inventory, and order management."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.include_router(auth_router)
app.include_router(cart_router)
app.include_router(category_router)
app.include_router(product_router)
app.include_router(order_router)
app.mount(
    "/ui",
    StaticFiles(directory=Path(__file__).parent / "frontend", html=True),
    name="frontend",
)


@app.get("/", tags=["Health"])
def root():
    return {"message": "E-Commerce API is running", "docs": "/docs"}


@app.get("/health", tags=["Health"])
def health_check(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "connected"}


@app.get("/protected", tags=["Authentication"])
def protected_route(current_user: User = Depends(get_current_user)):
    return {
        "message": "You are authenticated",
        "user": {
            "id": current_user.id,
            "email": current_user.email,
            "role": current_user.role,
        },
    }
