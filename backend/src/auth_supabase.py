# Supabase連携のFastAPIエンドポイント雛形
from fastapi import APIRouter

router = APIRouter()

@router.get("/user/info")
def user_info():
    # Supabaseからユーザー情報取得
    # ...（略）...
    return {"msg": "ユーザー情報取得"}
