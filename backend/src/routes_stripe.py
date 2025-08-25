from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
import stripe
import os
from appwrite.client import Client
from appwrite.services.databases import Databases
from datetime import datetime, timedelta

router = APIRouter()

STRIPE_API_KEY = os.getenv("STRIPE_API_KEY")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")
stripe.api_key = STRIPE_API_KEY

@router.post("/subscription/stripe/start")
async def create_stripe_checkout(request: Request):
    body = await request.json()
    discord_id = body.get("discord_id")
    if not discord_id:
        return JSONResponse({"error": "discord_idが必要です"}, status_code=400)
    try:
        checkout_session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{
                "price": os.getenv("STRIPE_PRICE_ID"),
                "quantity": 1,
            }],
            mode="subscription",
            success_url=os.getenv("STRIPE_SUCCESS_URL") + f"?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=os.getenv("STRIPE_CANCEL_URL"),
            client_reference_id=discord_id,
        )
        return JSONResponse({"checkout_url": checkout_session.url})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

@router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig_header = request.headers.get('stripe-signature')
    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, STRIPE_WEBHOOK_SECRET
        )
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)
    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        discord_id = session.get("client_reference_id")
        client = Client()
        client.set_endpoint(os.getenv("APPWRITE_ENDPOINT")).set_project(os.getenv("APPWRITE_PROJECT_ID")).set_key(os.getenv("APPWRITE_API_KEY"))
        db = Databases(client)
        expires_at = (datetime.utcnow() + timedelta(days=30)).isoformat()
        try:
            db.create_document(
                database_id="subscriptions",
                collection_id="plans",
                document_id=discord_id,
                data={
                    "discord_id": discord_id,
                    "plan": "premium",
                    "expires_at": expires_at
                }
            )
        except Exception as e:
            pass
    return JSONResponse({"status": "ok"})
