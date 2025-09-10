# Sentry連携のFastAPI雛形
import sentry_sdk
from fastapi import APIRouter

sentry_sdk.init(dsn="YOUR_SENTRY_DSN")
router = APIRouter()

@router.get("/error-test")
def error_test():
    1/0  # 強制エラー
    return {"msg": "OK"}
