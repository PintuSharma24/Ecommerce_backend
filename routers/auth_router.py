from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from db_conn import get_db
from dependencies import get_current_admin, get_current_user
from models.user import User
from schemas.user_schema import UserCreate, UserLogin, UserResponse, UserUpdate
from utils.jwt import create_access_token
from utils.password import hash_password, verify_password


router = APIRouter(tags=["Authentication and users"])


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def register_user(user: UserCreate, db: Session = Depends(get_db)):
    new_user = User(
        full_name=user.full_name.strip(),
        email=user.email,
        password=hash_password(user.password),
        mobile=user.mobile.strip(),
        role="customer",
    )
    db.add(new_user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )
    db.refresh(new_user)
    return new_user


@router.post("/login")
def login_user(user: UserLogin, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(User.email == user.email).first()
    if existing_user is None or not verify_password(
        user.password, existing_user.password
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(
        {
            "sub": str(existing_user.id),
            "email": existing_user.email,
            "role": existing_user.role,
        }
    )
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/users/me", response_model=UserResponse)
def get_profile(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/users/me", response_model=UserResponse)
def update_profile(
    changes: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    for field, value in changes.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(current_user, field, value.strip())
    db.commit()
    db.refresh(current_user)
    return current_user


@router.get("/users", response_model=list[UserResponse], tags=["Users"])
def list_users(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    if skip < 0 or not 1 <= limit <= 100:
        raise HTTPException(status_code=422, detail="Invalid pagination parameters")
    return db.query(User).order_by(User.id).offset(skip).limit(limit).all()
