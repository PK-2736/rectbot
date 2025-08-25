from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from appwrite.client import Client
from appwrite.services.databases import Databases
from datetime import datetime, timedelta
import os

router = APIRouter()

APPWRITE_ENDPOINT = os.getenv("APPWRITE_ENDPOINT")
APPWRITE_PROJECT_ID = os.getenv("APPWRITE_PROJECT_ID")
APPWRITE_API_KEY = os.getenv("APPWRITE_API_KEY")


@router.post("/subscription/start")
async def start_subscription(request: Request):
    body = await request.json()
    discord_id = body.get("discord_id")
    plan = body.get("plan", "premium")
    if not discord_id:
        return JSONResponse({"error": "discord_idが必要です"}, status_code=400)
    client = Client()
    client.set_endpoint(APPWRITE_ENDPOINT).set_project(APPWRITE_PROJECT_ID).set_key(APPWRITE_API_KEY)
    db = Databases(client)
    expires_at = (datetime.utcnow() + timedelta(days=30)).isoformat()
    try:
        result = db.create_document(
            database_id="subscriptions",
            collection_id="plans",
            document_id=discord_id,
            data={
                "discord_id": discord_id,
                "plan": plan,
                "expires_at": expires_at
            }
        )
        return JSONResponse({"status": "ok", "expires_at": expires_at})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

@router.get("/subscription/status/{discord_id}")
async def check_subscription(discord_id: str):
    client = Client()
    client.set_endpoint(APPWRITE_ENDPOINT).set_project(APPWRITE_PROJECT_ID).set_key(APPWRITE_API_KEY)
    db = Databases(client)
    try:
        doc = db.get_document(
            database_id="subscriptions",
            collection_id="plans",
            document_id=discord_id
        )
        return JSONResponse({"plan": doc["plan"], "expires_at": doc["expires_at"]})
    except Exception as e:
        return JSONResponse({"error": "未契約またはエラー: " + str(e)}, status_code=404)
