# Stripe課金連携のFastAPIエンドポイント雛形
from fastapi import APIRouter, Request

router = APIRouter()

@router.post("/stripe/webhook")
def stripe_webhook(request: Request):
    # StripeのWebhook受信処理
    # ...（略）...
    return {"msg": "Webhook受信"}
