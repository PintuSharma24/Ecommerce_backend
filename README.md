# E-commerce Backend API

A FastAPI and PostgreSQL backend for customer accounts, a product catalog, categories, inventory, and order management. Interactive API documentation is available at `/docs` when the service is running.

## Features

- Customer registration, JWT login, profile viewing and editing
- Admin-only user listing and catalog management
- Public product and category browsing with product search and pagination
- Persistent customer carts with inventory-aware checkout
- Order creation with stock checks, inventory deduction, and price snapshots
- Customer order history, order details, and cancellation of pending orders
- Admin order status transitions: `pending` → `processing` → `shipped` → `delivered`
- SQLAlchemy models and Alembic database migrations

Registration always creates a `customer`. A request cannot assign itself an administrator role. To provision an administrator, register the account first, then promote it through a trusted database session:

```sql
UPDATE users SET role = 'admin' WHERE email = 'admin@example.com';
```

## Requirements

- Python 3.10 or newer
- PostgreSQL

## Setup

Run these commands from the project directory in PowerShell:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Update `.env` with a real PostgreSQL connection URL and a unique JWT signing key. If `.env` already exists, preserve its database settings and add or update `JWT_SECRET_KEY`. Generate a key with:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

`JWT_SECRET_KEY` must contain at least 32 characters. Keep `.env` private and do not commit it. Instead of `DATABASE_URL`, you may configure `DB_USERNAME`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, and `DB_NAME`.

Create or update the database schema:

```powershell
alembic upgrade head
```

Start the development server:

```powershell
uvicorn main:app --reload
```

The API is served at `http://127.0.0.1:8000`; OpenAPI documentation is at `http://127.0.0.1:8000/docs`, and readiness (including the database connection) is checked at `/health`.

Open the visual commerce studio at `http://127.0.0.1:8000/ui/`. It connects directly to the API, demonstrates account management, the product catalog, customer cart and checkout, order tracking, and admin workflows, and includes a walkthrough of the backend architecture. Sign in with a customer account to try cart and order features. Use an administrator account for the Admin Studio.

## Authentication

Register at `POST /register`, then log in at `POST /login`. Use the returned token on protected endpoints:

```http
Authorization: Bearer <access_token>
```

Tokens expire after `ACCESS_TOKEN_EXPIRE_MINUTES` (30 minutes by default). The API reads the current user from the database for each authenticated request, so token role claims are not used to grant privileges.

## API routes

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/` | Public | API welcome and docs location |
| `GET` | `/health` | Public | Readiness and database connectivity |
| `POST` | `/register` | Public | Create a customer account |
| `POST` | `/login` | Public | Obtain a bearer token |
| `GET` | `/protected` | Authenticated | Verify token and current account |
| `GET` | `/users/me` | Authenticated | Read own profile |
| `PATCH` | `/users/me` | Authenticated | Update own name or mobile |
| `GET` | `/users` | Admin | List accounts (`skip`, `limit`) |
| `GET` | `/cart` | Authenticated | View own cart |
| `POST` | `/cart/items` | Authenticated | Add a product to own cart |
| `PATCH` | `/cart/items/{product_id}` | Authenticated | Set cart item quantity |
| `DELETE` | `/cart/items/{product_id}` | Authenticated | Remove a cart item |
| `DELETE` | `/cart` | Authenticated | Clear own cart |
| `GET` | `/categories` | Public | List categories |
| `GET` | `/categories/{category_id}` | Public | Read a category |
| `POST` | `/categories` | Admin | Create a category |
| `PUT` | `/categories/{category_id}` | Admin | Rename a category |
| `DELETE` | `/categories/{category_id}` | Admin | Delete an unused category |
| `GET` | `/products` | Public | Browse products (`q`, `category_id`, `skip`, `limit`) |
| `GET` | `/products/{product_id}` | Public | Read a product |
| `POST` | `/products` | Admin | Create a product |
| `PUT` | `/products/{product_id}` | Admin | Replace a product |
| `PATCH` | `/products/{product_id}` | Admin | Update product fields |
| `DELETE` | `/products/{product_id}` | Admin | Delete a product without order history |
| `POST` | `/orders` | Authenticated | Create an order and reserve stock |
| `POST` | `/orders/checkout` | Authenticated | Create an order from cart and clear cart |
| `GET` | `/orders` | Authenticated | List own orders; admins can list all |
| `GET` | `/orders/{order_id}` | Owner or admin | Read an order |
| `POST` | `/orders/{order_id}/cancel` | Owner or admin | Cancel a pending order and restore stock |
| `PATCH` | `/orders/{order_id}/status` | Admin | Advance an order to its next status |

List endpoints are bounded to at most 100 records per request. An order request contains one or more distinct product IDs and positive quantities, for example:

```json
{
  "items": [
    { "product_id": 1, "quantity": 2 },
    { "product_id": 4, "quantity": 1 }
  ]
}
```

Order prices are recorded at purchase time. Cart contents do not reserve inventory until checkout. Products referenced by order history or a customer cart and categories with products cannot be deleted; update them instead. A pending order can be cancelled, which returns its quantities to inventory. Once an order is processing, only the allowed forward status transitions are accepted.

## Development and tests

Run the test suite with:

```powershell
pytest
```

`alembic upgrade head` applies migrations to the configured database. To create a new schema change, update the SQLAlchemy model and generate a revision with `alembic revision --autogenerate -m "describe change"`, then inspect the generated migration before applying it.

## Scope

This project provides the commerce API foundation; it does not process payments, calculate shipping/taxes, send notifications, or provide a storefront. Integrate a payment provider and fulfillment workflow before accepting real purchases.
