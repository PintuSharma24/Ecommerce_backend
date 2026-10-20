import os

os.environ.setdefault("JWT_SECRET_KEY", "test-key-that-is-at-least-32-characters-long")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from db_conn import Base, get_db
from main import app
from models.user import User
from utils.password import hash_password


@pytest.fixture
def client():
    test_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=test_engine)
    test_session = sessionmaker(bind=test_engine, autocommit=False, autoflush=False)

    with test_session() as db:
        db.add(
            User(
                full_name="Store Administrator",
                email="admin@example.com",
                password=hash_password("admin-password-123"),
                mobile="5550000000",
                role="admin",
            )
        )
        db.commit()

    def override_get_db():
        with test_session() as db:
            yield db

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=test_engine)
    test_engine.dispose()


def login(client: TestClient, email: str, password: str) -> dict[str, str]:
    response = client.post(
        "/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_registration_cannot_assign_admin_role_and_profile_is_editable(client):
    assert client.get("/health").json() == {
        "status": "ok",
        "database": "connected",
    }
    frontend = client.get("/ui/")
    assert frontend.status_code == 200
    assert "Forma — E-commerce API Studio" in frontend.text
    assert client.get("/ui/app.js").status_code == 200
    assert client.get("/ui/styles.css").status_code == 200
    response = client.post(
        "/register",
        json={
            "full_name": "New Customer",
            "email": "customer@example.com",
            "password": "customer-password-123",
            "mobile": "5551112222",
            "role": "admin",
        },
    )
    assert response.status_code == 201
    assert response.json()["role"] == "customer"

    customer_headers = login(client, "customer@example.com", "customer-password-123")
    profile = client.get("/users/me", headers=customer_headers)
    assert profile.status_code == 200
    assert profile.json()["email"] == "customer@example.com"
    assert client.patch(
        "/users/me",
        headers=customer_headers,
        json={"full_name": "Updated Customer"},
    ).json()["full_name"] == "Updated Customer"
    assert client.get("/users", headers=customer_headers).status_code == 403


def test_catalog_orders_inventory_and_status_transitions(client):
    admin_headers = login(client, "admin@example.com", "admin-password-123")
    customer = client.post(
        "/register",
        json={
            "full_name": "Customer",
            "email": "buyer@example.com",
            "password": "buyer-password-123",
            "mobile": "5553334444",
        },
    )
    assert customer.status_code == 201
    customer_headers = login(client, "buyer@example.com", "buyer-password-123")

    category = client.post(
        "/categories",
        headers=admin_headers,
        json={"name": "Books"},
    )
    assert category.status_code == 201
    category_id = category.json()["id"]
    product = client.post(
        "/products",
        headers=admin_headers,
        json={
            "name": "API Design",
            "description": "Practical guide",
            "price": 12.5,
            "stock": 3,
            "category_id": category_id,
        },
    )
    assert product.status_code == 201
    product_id = product.json()["id"]
    assert client.get("/products", params={"q": "api"}).json()[0]["id"] == product_id
    assert client.post(
        "/products",
        headers=customer_headers,
        json={
            "name": "Forbidden",
            "price": 1,
            "stock": 1,
            "category_id": category_id,
        },
    ).status_code == 403

    cart_item = client.post(
        "/cart/items",
        headers=customer_headers,
        json={"product_id": product_id, "quantity": 1},
    )
    assert cart_item.status_code == 201
    assert client.get("/cart", headers=customer_headers).json()[0]["quantity"] == 1
    checkout = client.post("/orders/checkout", headers=customer_headers)
    assert checkout.status_code == 201
    assert client.get("/cart", headers=customer_headers).json() == []
    assert client.get(f"/products/{product_id}").json()["stock"] == 2
    assert client.post(
        f"/orders/{checkout.json()['id']}/cancel",
        headers=customer_headers,
    ).json()["status"] == "cancelled"

    insufficient = client.post(
        "/orders",
        headers=customer_headers,
        json={"items": [{"product_id": product_id, "quantity": 4}]},
    )
    assert insufficient.status_code == 409
    order_response = client.post(
        "/orders",
        headers=customer_headers,
        json={"items": [{"product_id": product_id, "quantity": 2}]},
    )
    assert order_response.status_code == 201
    order = order_response.json()
    assert order["total_amount"] == 25
    assert len(order["items"]) == 1
    assert client.get("/products/" + str(product_id)).json()["stock"] == 1
    assert client.post(
        f"/orders/{order['id']}/cancel",
        headers=customer_headers,
    ).json()["status"] == "cancelled"
    assert client.get("/products/" + str(product_id)).json()["stock"] == 3

    next_order = client.post(
        "/orders",
        headers=customer_headers,
        json={"items": [{"product_id": product_id, "quantity": 1}]},
    ).json()
    changed = client.patch(
        f"/orders/{next_order['id']}/status",
        headers=admin_headers,
        json={"status": "processing"},
    )
    assert changed.status_code == 200
    assert changed.json()["status"] == "processing"
    assert client.patch(
        f"/orders/{next_order['id']}/status",
        headers=admin_headers,
        json={"status": "delivered"},
    ).status_code == 409
