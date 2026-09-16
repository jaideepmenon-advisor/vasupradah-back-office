"""
Vasupradah order-link proxy.

The order-link Gateway's POST /api/order-links sends no CORS headers, so a
browser calling it directly is always blocked ("No 'Access-Control-Allow-
Origin' header is present..."), whether the console runs from file:// or a
hosted page. This small server runs wherever you can reach it from the
browser running the console (your own machine is fine), holds the
PocketBase api_clients credentials, and forwards order-link requests to the
Gateway server-to-server - which isn't subject to browser CORS at all.

Setup:
    pip install -r requirements.txt
    cp .env.example .env      # fill in your api_clients email/password
    python app.py

Then in the console: Settings -> Order-link gateway -> Proxy URL ->
http://localhost:8787 (or wherever this ends up running).
"""
import os
import threading
import time

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request

load_dotenv()

POCKETBASE_URL = os.environ.get("POCKETBASE_URL", "https://equity.vasupradah.com/pb").rstrip("/")
APP_URL = os.environ.get("APP_URL", "https://equity.vasupradah.com").rstrip("/")
EMAIL = os.environ.get("ORDER_LINK_EMAIL", "")
PASSWORD = os.environ.get("ORDER_LINK_PASSWORD", "")
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "*")
PORT = int(os.environ.get("PORT", "8787"))
TOKEN_TTL_SECONDS = 45 * 60

app = Flask(__name__)

_token_lock = threading.Lock()
_token_cache = {"token": "", "at": 0.0}


def get_token(force=False):
    with _token_lock:
        if not force and _token_cache["token"] and time.time() - _token_cache["at"] < TOKEN_TTL_SECONDS:
            return _token_cache["token"]
    if not EMAIL or not PASSWORD:
        raise RuntimeError("ORDER_LINK_EMAIL / ORDER_LINK_PASSWORD are not set (check your .env).")
    resp = requests.post(
        f"{POCKETBASE_URL}/api/collections/api_clients/auth-with-password",
        json={"identity": EMAIL, "password": PASSWORD},
        timeout=10,
    )
    resp.raise_for_status()
    token = resp.json()["token"]
    with _token_lock:
        _token_cache["token"] = token
        _token_cache["at"] = time.time()
    return token


@app.after_request
def add_cors_headers(resp):
    resp.headers["Access-Control-Allow-Origin"] = ALLOWED_ORIGIN
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    resp.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    return resp


@app.route("/health")
def health():
    return jsonify({"ok": True, "hasCredentials": bool(EMAIL and PASSWORD)})


@app.route("/api/order-links", methods=["POST", "OPTIONS"])
def order_links():
    if request.method == "OPTIONS":
        return ("", 204)

    body = request.get_json(force=True, silent=True) or {}
    for field in ("orderId", "phoneNumber", "ticker"):
        if not body.get(field):
            return jsonify({"success": False, "error": f"Missing {field}"}), 400

    try:
        token = get_token()
        gw_resp = requests.post(
            f"{APP_URL}/api/order-links",
            headers={"Authorization": token},
            json=body,
            timeout=15,
        )
        if gw_resp.status_code == 401:
            token = get_token(force=True)
            gw_resp = requests.post(
                f"{APP_URL}/api/order-links",
                headers={"Authorization": token},
                json=body,
                timeout=15,
            )
        return (gw_resp.text, gw_resp.status_code, {"Content-Type": "application/json"})
    except requests.RequestException as e:
        return jsonify({"success": False, "error": f"Could not reach the order-link gateway: {e}"}), 502
    except RuntimeError as e:
        return jsonify({"success": False, "error": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT)
