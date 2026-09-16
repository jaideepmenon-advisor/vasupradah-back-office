# Order-link proxy

A small Flask server that stands between the console (running in a browser)
and the Vasupradah order-link Gateway at `equity.vasupradah.com`.

## Why this exists

The Gateway's `POST /api/order-links` endpoint sends no
`Access-Control-Allow-Origin` header, so a browser calling it directly is
always blocked by CORS — this isn't something fixable from the console's
JavaScript, since CORS is enforced by the browser based on the *server's*
response headers. This proxy runs the same two-step call (PocketBase login,
then `POST /api/order-links`) from Python instead, where CORS doesn't apply,
and adds its own CORS headers so the browser can call *this* server freely.

## Setup

```bash
cd order-link-proxy
python3 -m venv .venv && source .venv/bin/activate   # optional but recommended
pip install -r requirements.txt
cp .env.example .env
# edit .env: set ORDER_LINK_EMAIL / ORDER_LINK_PASSWORD to your api_clients
# account (created with `python manage_db.py add-api-client <email> <password>`
# on the Gateway side)
python app.py
```

By default it listens on `http://localhost:8787`.

## Point the console at it

In the console: **Settings → Order-link gateway → Proxy URL** →
`http://localhost:8787` (or wherever this ends up running/reachable from
the browser). The console no longer needs the Gateway URL or credentials
directly — those live only in this proxy's `.env`.

## Running it alongside the console

Since the console is a single portable HTML file that's often just opened
locally, the simplest setup is running this proxy on the same machine
(`localhost`) whenever you're about to send Advice orders with execute
links. It needs to be running for order-link creation to work; if it isn't,
the console will show "Could not reach the order-link proxy. Is it
running?" instead of a link.

To keep it running in the background instead of a foreground terminal, use
your OS's usual tools (e.g. `pm2`, a `systemd` service, `screen`/`tmux`, or
just leave the terminal window open).

## Endpoints

- `GET /health` — `{"ok": true, "hasCredentials": true|false}`, useful to
  confirm the proxy is up and `.env` is filled in.
- `POST /api/order-links` — same request/response shape as the Gateway's
  own endpoint (see the main API guide); this just adds the auth step and
  CORS headers around it.
