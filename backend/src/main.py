
"""Backend main module (FastAPI + Appwrite integration)."""

from dotenv import load_dotenv
from pathlib import Path
import os  # moved before first os.environ usage

# 1st load: current working directory
load_dotenv()
# Fallback: try project root (two levels up) if DISCORD vars missing
if not (os.environ.get("DISCORD_CLIENT_ID") and os.environ.get("DISCORD_REDIRECT_URI")):
    possible_root = Path(__file__).resolve().parents[2] / ".env"
    if possible_root.exists():
        load_dotenv(dotenv_path=possible_root, override=False)

import os  # already imported above (kept for grouping but safe)
import json
import hmac
import hashlib
import secrets
from datetime import datetime
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
import requests
import stripe
from appwrite.client import Client
from appwrite.services.databases import Databases
from appwrite.exception import AppwriteException


def get_env_var(key: str, default: str = "") -> str:
    return os.environ.get(key, default)


# Environment / Config
APPWRITE_ENDPOINT = get_env_var("APPWRITE_ENDPOINT", "")  # 必須: 未設定なら後で警告

def _resolve_project_id():
    # Accept multiple possible env names to avoid mismatch
    candidates = [
        get_env_var("APPWRITE_PROJECT_ID"),
        get_env_var("APPWRITE_PROJECT"),
        get_env_var("VITE_APPWRITE_PROJECT_ID"),
        get_env_var("VITE_APPWRITE_PROJECT"),
        get_env_var("REACT_APP_APPWRITE_PROJECT"),
    ]
    for c in candidates:
        if c:
            return c
    return None

APPWRITE_PROJECT_ID = _resolve_project_id()
APPWRITE_API_KEY = get_env_var("APPWRITE_API_KEY")

DISCORD_CLIENT_ID = get_env_var("DISCORD_CLIENT_ID")
DISCORD_CLIENT_SECRET = get_env_var("DISCORD_CLIENT_SECRET")
DISCORD_REDIRECT_URI = get_env_var("DISCORD_REDIRECT_URI")
OAUTH_STATE_SECRET = get_env_var("OAUTH_STATE_SECRET", "change_this_state_secret")

APPWRITE_DB_USERS_ID = get_env_var("APPWRITE_DB_USERS_ID", "users")
APPWRITE_COLLECTION_DISCORD_ID = get_env_var("APPWRITE_COLLECTION_DISCORD_ID", "discord")
APPWRITE_DB_SUBSCRIPTIONS_ID = get_env_var("APPWRITE_DB_SUBSCRIPTIONS_ID", "subscriptions")
APPWRITE_COLLECTION_PLANS_ID = get_env_var("APPWRITE_COLLECTION_PLANS_ID", "plans")

FRONTEND_ORIGIN = get_env_var("FRONTEND_ORIGIN", "http://localhost:3000")

STRIPE_API_KEY = get_env_var("STRIPE_API_KEY")
STRIPE_WEBHOOK_SECRET = get_env_var("STRIPE_WEBHOOK_SECRET")
if STRIPE_API_KEY:
    stripe.api_key = STRIPE_API_KEY


from backend.src.auth_discord import router as discord_router
app = FastAPI(title="Discord Bot API", version="1.1.0")

# CORS
raw_origins = get_env_var("FRONTEND_ORIGINS", FRONTEND_ORIGIN)
origins = [o.strip() for o in raw_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"]
)
app.include_router(discord_router)


def create_appwrite_client():
    client = Client()
    if not APPWRITE_ENDPOINT:
        raise RuntimeError("APPWRITE_ENDPOINT 未設定 (.env に APPWRITE_ENDPOINT=... を指定してください)" )
    client.set_endpoint(APPWRITE_ENDPOINT)
    if not APPWRITE_PROJECT_ID:
        raise RuntimeError("Appwrite project ID not configured (APPWRITE_PROJECT_ID / APPWRITE_PROJECT / *_APPWRITE_PROJECT_*)")
    client.set_project(APPWRITE_PROJECT_ID)
    if APPWRITE_API_KEY:
        client.set_key(APPWRITE_API_KEY)
    return client

@app.on_event("startup")
def _startup_check():
    # Basic sanity log (avoid printing API key)
    pid = APPWRITE_PROJECT_ID or "<missing>"
    try:
        # lightweight health check
        requests.get(APPWRITE_ENDPOINT.rstrip('/') + '/health/version', timeout=3)
    except Exception:
        pass  # ignore here
    if not APPWRITE_PROJECT_ID:
        print("[WARN] APPWRITE_PROJECT_ID not resolved. Set APPWRITE_PROJECT_ID in backend .env.")
    else:
        print(f"[INFO] Using Appwrite project: {pid}")


@app.get("/health")
def health_check():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}


def _sign_state(raw: str) -> str:
    sig = hmac.new(OAUTH_STATE_SECRET.encode(), raw.encode(), hashlib.sha256).hexdigest()
    return f"{raw}.{sig}"


def _verify_state(signed: str) -> bool:
    if not signed or "." not in signed:
        return False
    raw, sig = signed.rsplit(".", 1)
    expected = hmac.new(OAUTH_STATE_SECRET.encode(), raw.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig, expected)


@app.get("/auth/discord/login")
def discord_login():
    # Re-read in case fallback loaded later
    missing = []
    """
    redirect_uri = os.environ.get("DISCORD_REDIRECT_URI")
    if not cid:
        missing.append("DISCORD_CLIENT_ID")
    if not redirect_uri:
        missing.append("DISCORD_REDIRECT_URI")
    if missing:
        raise HTTPException(status_code=500, detail=f"Discord OAuth2設定が不完全です: {', '.join(missing)} 未設定 (.env の位置を確認)")
    # use refreshed values
    global DISCORD_CLIENT_ID, DISCORD_REDIRECT_URI
    DISCORD_CLIENT_ID = cid
    DISCORD_REDIRECT_URI = redirect_uri
    raw_state = secrets.token_urlsafe(24)
    state = _sign_state(raw_state)
    url = (
        f"https://discord.com/api/oauth2/authorize?client_id={DISCORD_CLIENT_ID}"
        f"&redirect_uri={DISCORD_REDIRECT_URI}"
        f"&response_type=code&scope=identify%20email&state={state}"
    )
    return RedirectResponse(url)


@app.get("/auth/discord/callback")
async def discord_callback(request: Request):
    code = request.query_params.get("code")
    state = request.query_params.get("state")
    if not code:
        return JSONResponse({"error": "認証コードがありません"}, status_code=400)
    if not _verify_state(state):
        return JSONResponse({"error": "state 不正"}, status_code=400)

    data = {
        "client_id": DISCORD_CLIENT_ID,
        "client_secret": DISCORD_CLIENT_SECRET,
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": DISCORD_REDIRECT_URI,
        "scope": "identify email"
    }
    headers = {"Content-Type": "application/x-www-form-urlencoded"}

    try:
        token_res = requests.post("https://discord.com/api/oauth2/token", data=data, headers=headers, timeout=10)
        if token_res.status_code != 200:
            return JSONResponse({"error": "トークン取得失敗"}, status_code=400)
        access_token = token_res.json().get("access_token")
        user_res = requests.get(
            "https://discord.com/api/users/@me",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10
        )
        if user_res.status_code != 200:
            return JSONResponse({"error": "ユーザー情報取得失敗"}, status_code=400)
        user_info = user_res.json()

        # Save to Appwrite
        try:
            client = create_appwrite_client()
            db = Databases(client)
            document_id = user_info["id"]
            try:
                db.create_document(
                    database_id=APPWRITE_DB_USERS_ID,
                    collection_id=APPWRITE_COLLECTION_DISCORD_ID,
                    document_id=document_id,
                    data=user_info
                )
            except AppwriteException as ce:
                # If already exists, attempt update; otherwise bubble up
                if ce.code != 409:  # 409 conflict -> proceed to update
                    return JSONResponse({
                        "error": "Appwrite create_document失敗",
                        "detail": str(ce),
                        "appwrite_code": getattr(ce, 'code', None),
                        "appwrite_type": getattr(ce, 'type', None),
                        "project": APPWRITE_PROJECT_ID,
                        "endpoint": APPWRITE_ENDPOINT,
                        "db_id": APPWRITE_DB_USERS_ID,
                        "collection_id": APPWRITE_COLLECTION_DISCORD_ID
                    }, status_code=500)
                try:
                    db.update_document(
                        database_id=APPWRITE_DB_USERS_ID,
                        collection_id=APPWRITE_COLLECTION_DISCORD_ID,
                        document_id=document_id,
                        data=user_info
                    )
                except AppwriteException as ue:
                    return JSONResponse({
                        "error": "Appwrite update_document失敗",
                        "detail": str(ue),
                        "appwrite_code": getattr(ue, 'code', None),
                        "appwrite_type": getattr(ue, 'type', None),
                        "project": APPWRITE_PROJECT_ID,
                        "endpoint": APPWRITE_ENDPOINT,
                        "db_id": APPWRITE_DB_USERS_ID,
                        "collection_id": APPWRITE_COLLECTION_DISCORD_ID
                    }, status_code=500)
        except AppwriteException as e:
            return JSONResponse({
                "error": "Appwriteクライアント処理エラー",
                "detail": str(e),
                "project": APPWRITE_PROJECT_ID,
                "endpoint": APPWRITE_ENDPOINT
            }, status_code=500)
        except Exception as e:
            return JSONResponse({"error": f"Appwrite DB処理エラー: {e}"}, status_code=500)

        # Redirect to frontend (could attach token in future)
        return RedirectResponse(f"{FRONTEND_ORIGIN}/?discord_id={user_info['id']}")
    except requests.RequestException as e:
        return JSONResponse({"error": f"Discord API通信エラー: {e}"}, status_code=500)


@app.get("/subscription/status/{discord_id}")
def check_subscription(discord_id: str):
    try:
        client = create_appwrite_client()
        db = Databases(client)
        doc = db.get_document(
            database_id=APPWRITE_DB_SUBSCRIPTIONS_ID,
            collection_id=APPWRITE_COLLECTION_PLANS_ID,
            document_id=discord_id
        )
        return {"plan": doc.get("plan"), "expires_at": doc.get("expires_at")}
    except Exception as e:
        return JSONResponse({"error": f"未契約またはエラー: {e}"}, status_code=404)


@app.post("/subscription/stripe/start")
async def create_stripe_checkout(request: Request):
    if not STRIPE_API_KEY:
        return JSONResponse({"error": "Stripe設定が不完全です"}, status_code=500)
    body = await request.json()
    discord_id = body.get("discord_id")
    if not discord_id:
        return JSONResponse({"error": "discord_idが必要です"}, status_code=400)
    session = stripe.checkout.Session.create(
        payment_method_types=["card"],
        line_items=[{"price": get_env_var("STRIPE_PRICE_ID"), "quantity": 1}],
        mode="subscription",
        success_url=get_env_var("STRIPE_SUCCESS_URL", "") + "?session_id={CHECKOUT_SESSION_ID}",
        cancel_url=get_env_var("STRIPE_CANCEL_URL", ""),
        client_reference_id=discord_id,
    )
    return {"checkout_url": session.url}


@app.get("/subscription/stripe/start")
def create_stripe_checkout_get(discord_id: str):
    if not STRIPE_API_KEY:
        raise HTTPException(status_code=500, detail="Stripe設定が不完全です")
    if not discord_id:
        raise HTTPException(status_code=400, detail="discord_idが必要です")
    session = stripe.checkout.Session.create(
        payment_method_types=["card"],
        line_items=[{"price": get_env_var("STRIPE_PRICE_ID"), "quantity": 1}],
        mode="subscription",
        success_url=get_env_var("STRIPE_SUCCESS_URL", "") + "?session_id={CHECKOUT_SESSION_ID}",
        cancel_url=get_env_var("STRIPE_CANCEL_URL", ""),
        client_reference_id=discord_id,
    )
    return RedirectResponse(session.url)


@app.get("/discord/users/{discord_id}")
def get_discord_user(discord_id: str):
    """(デバッグ用) 保存済み Discord ユーザードキュメント取得"""
    try:
        client = create_appwrite_client()
        db = Databases(client)
        doc = db.get_document(
            database_id=APPWRITE_DB_USERS_ID,
            collection_id=APPWRITE_COLLECTION_DISCORD_ID,
            document_id=discord_id
        )
        return {"found": True, "document": doc}
    except AppwriteException as e:
        return JSONResponse({
            "found": False,
            "error": str(e),
            "appwrite_code": getattr(e, 'code', None),
            "appwrite_type": getattr(e, 'type', None)
        }, status_code=404)
    except Exception as e:
        return JSONResponse({"found": False, "error": f"unexpected: {e}"}, status_code=500)


def main(req, res):  # Appwrite Functions entry (simplified)
    try:
        if req.method.upper() == "GET" and req.path == "/":
            return res.json({"message": "Discord Bot API is running on Appwrite Functions!"})
        if req.method.upper() == "GET" and req.path == "/health":
            return res.json({"status": "ok", "timestamp": datetime.utcnow().isoformat(), "platform": "Appwrite Functions"})
        return res.json({"error": "Not Found"}, 404)
    except Exception as e:
        return res.json({"error": str(e)}, 500)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

# -------------------- Debug (remove in production) --------------------
@app.get("/debug/appwrite")
def debug_appwrite():
    """Return current resolved Appwrite configuration (sanitized) and a simple health check."""
    # Mask API key
    masked_key = None
    if APPWRITE_API_KEY:
        if len(APPWRITE_API_KEY) <= 8:
            masked_key = "*" * len(APPWRITE_API_KEY)
        else:
            masked_key = APPWRITE_API_KEY[:4] + "..." + APPWRITE_API_KEY[-4:]
    # Raw repr to catch hidden chars
    project_repr = repr(APPWRITE_PROJECT_ID)
    # Attempt simple request with manual header
    test_status = None
    test_error = None
    try:
        r = requests.get(
            APPWRITE_ENDPOINT.rstrip('/') + '/health/version',
            headers={"X-Appwrite-Project": APPWRITE_PROJECT_ID} if APPWRITE_PROJECT_ID else {},
            timeout=5
        )
        test_status = r.status_code
    except Exception as e:
        test_error = str(e)
    return {
        "endpoint": APPWRITE_ENDPOINT,
        "project_id": APPWRITE_PROJECT_ID,
        "project_id_repr": project_repr,
        "db_users_id": APPWRITE_DB_USERS_ID,
        "collection_discord_id": APPWRITE_COLLECTION_DISCORD_ID,
        "api_key_masked": masked_key,
        "health_version_status_with_header": test_status,
        "health_error": test_error
    }
