"""IronPeak Fitness web server.

Pure Python standard library - no packages to install.

    python server.py                 # serve on http://localhost:8000
    python server.py --port 9000     # choose another port
    python server.py --inquiries     # print contact-form submissions and exit
    python server.py --subscribers   # print newsletter subscribers and exit

Customer messages can be read in the browser at http://localhost:8000/admin
(username "admin"; password from IRONPEAK_ADMIN_PASSWORD, default "ironpeak").
"""

import argparse
import base64
import csv
import hmac
import io
import json
import os
import re
import sys
import webbrowser
from datetime import datetime
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

import chatbot
import database

# Settings (OpenAI key, admin password) can live in a .env file next to this script.
chatbot.load_env_file()

STATIC_DIR = os.path.join(database.BASE_DIR, "static")
ADMIN_PAGE = os.path.join(database.BASE_DIR, "admin", "index.html")
ADMIN_USER = "admin"
ADMIN_PASSWORD = os.environ.get("IRONPEAK_ADMIN_PASSWORD", "ironpeak")
ADMIN_ITEM_RE = re.compile(r"^/api/admin/(inquiries|subscribers)/(\d+)$")
MAX_BODY_BYTES = 32 * 1024
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
INTERESTS = {"Membership", "Personal Training", "Group Classes", "Free Trial", "Corporate", "Other"}


class GymRequestHandler(SimpleHTTPRequestHandler):
    server_version = "IronPeak/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    # ---------- routing ----------
    def do_GET(self):
        path = urlparse(self.path).path
        routes = {
            "/api/plans": database.get_plans,
            "/api/trainers": database.get_trainers,
            "/api/classes": database.get_classes,
            "/api/testimonials": database.get_testimonials,
        }
        if path in routes:
            return self.send_json(routes[path]())
        if path == "/api/health":
            return self.send_json({"status": "ok"})
        if path == "/api/chat/status":
            return self.send_json({"enabled": chatbot.is_configured()})
        if path in ("/admin", "/admin/"):
            return self.require_admin() and self.send_admin_page()
        if path == "/api/admin/inquiries":
            return self.require_admin() and self.send_json(database.list_inquiries())
        if path == "/api/admin/subscribers":
            return self.require_admin() and self.send_json(database.list_subscribers())
        if path == "/api/admin/inquiries.csv":
            return self.require_admin() and self.send_csv(database.list_inquiries(), "inquiries")
        if path == "/api/admin/subscribers.csv":
            return self.require_admin() and self.send_csv(database.list_subscribers(), "subscribers")
        if path.startswith("/api/"):
            return self.send_json({"error": "Not found"}, HTTPStatus.NOT_FOUND)
        return super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/contact":
            return self.handle_contact()
        if path == "/api/newsletter":
            return self.handle_newsletter()
        if path == "/api/chat":
            return self.handle_chat()
        return self.send_json({"error": "Not found"}, HTTPStatus.NOT_FOUND)

    def do_PATCH(self):
        """Admin: change an inquiry's status (new / read / done)."""
        match = ADMIN_ITEM_RE.match(urlparse(self.path).path)
        if not match or match.group(1) != "inquiries":
            return self.send_json({"error": "Not found"}, HTTPStatus.NOT_FOUND)
        if not self.require_admin():
            return
        data = self.read_json()
        if data is None:
            return
        status = data.get("status")
        if status not in database.INQUIRY_STATUSES:
            return self.send_json({"ok": False, "error": "Invalid status."}, HTTPStatus.UNPROCESSABLE_ENTITY)
        if not database.set_inquiry_status(int(match.group(2)), status):
            return self.send_json({"ok": False, "error": "Not found"}, HTTPStatus.NOT_FOUND)
        return self.send_json({"ok": True})

    def do_DELETE(self):
        """Admin: delete an inquiry or a subscriber."""
        match = ADMIN_ITEM_RE.match(urlparse(self.path).path)
        if not match:
            return self.send_json({"error": "Not found"}, HTTPStatus.NOT_FOUND)
        if not self.require_admin():
            return
        remove = database.delete_inquiry if match.group(1) == "inquiries" else database.delete_subscriber
        if not remove(int(match.group(2))):
            return self.send_json({"ok": False, "error": "Not found"}, HTTPStatus.NOT_FOUND)
        return self.send_json({"ok": True})

    # ---------- admin ----------
    def require_admin(self):
        """HTTP Basic auth. Returns True when authorised, otherwise sends 401."""
        header = self.headers.get("Authorization", "")
        if header.startswith("Basic "):
            try:
                user, _, password = base64.b64decode(header[6:]).decode("utf-8").partition(":")
            except (ValueError, UnicodeDecodeError):
                user, password = "", ""
            if hmac.compare_digest(user, ADMIN_USER) and hmac.compare_digest(password, ADMIN_PASSWORD):
                return True
        body = b"Login required."
        self.send_response(HTTPStatus.UNAUTHORIZED)
        self.send_header("WWW-Authenticate", 'Basic realm="IronPeak Admin", charset="UTF-8"')
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
        return False

    def send_admin_page(self):
        with open(ADMIN_PAGE, "rb") as f:
            body = f.read()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def send_csv(self, rows, name):
        buf = io.StringIO()
        if rows:
            writer = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
            writer.writeheader()
            writer.writerows(rows)
        body = ("﻿" + buf.getvalue()).encode("utf-8")  # BOM so Excel reads UTF-8
        stamp = datetime.now().strftime("%Y-%m-%d")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/csv; charset=utf-8")
        self.send_header("Content-Disposition", f'attachment; filename="ironpeak-{name}-{stamp}.csv"')
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    # ---------- handlers ----------
    def handle_contact(self):
        data = self.read_json()
        if data is None:
            return
        name = str(data.get("name", "")).strip()
        email = str(data.get("email", "")).strip()
        phone = str(data.get("phone", "")).strip()
        interest = str(data.get("interest", "")).strip()
        message = str(data.get("message", "")).strip()

        errors = {}
        if not 2 <= len(name) <= 80:
            errors["name"] = "Please enter your name."
        if not EMAIL_RE.match(email) or len(email) > 120:
            errors["email"] = "Please enter a valid email address."
        if len(phone) > 30:
            errors["phone"] = "Phone number is too long."
        if interest not in INTERESTS:
            errors["interest"] = "Please choose what you're interested in."
        if not 10 <= len(message) <= 2000:
            errors["message"] = "Message should be between 10 and 2000 characters."
        if errors:
            return self.send_json({"ok": False, "errors": errors}, HTTPStatus.UNPROCESSABLE_ENTITY)

        inquiry_id = database.add_inquiry(name, email, phone or None, interest, message)
        first = name.split()[0]
        return self.send_json(
            {"ok": True, "id": inquiry_id,
             "message": f"Thanks {first}! A coach will reach out within 24 hours."},
            HTTPStatus.CREATED)

    def handle_newsletter(self):
        data = self.read_json()
        if data is None:
            return
        email = str(data.get("email", "")).strip().lower()
        if not EMAIL_RE.match(email) or len(email) > 120:
            return self.send_json({"ok": False, "errors": {"email": "Please enter a valid email address."}},
                                  HTTPStatus.UNPROCESSABLE_ENTITY)
        added = database.add_subscriber(email)
        msg = "You're in! Watch your inbox for training tips." if added else "You're already on the list."
        return self.send_json({"ok": True, "message": msg}, HTTPStatus.CREATED if added else HTTPStatus.OK)

    def handle_chat(self):
        data = self.read_json()
        if data is None:
            return
        try:
            answer = chatbot.reply(data.get("messages"), client_id=self.client_address[0])
        except chatbot.ChatError as err:
            return self.send_json({"ok": False, "error": str(err)}, err.status)
        return self.send_json({"ok": True, "reply": answer})

    # ---------- helpers ----------
    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY_BYTES:
            self.send_json({"ok": False, "error": "Invalid request body."}, HTTPStatus.BAD_REQUEST)
            return None
        try:
            data = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self.send_json({"ok": False, "error": "Body must be valid JSON."}, HTTPStatus.BAD_REQUEST)
            return None
        if not isinstance(data, dict):
            self.send_json({"ok": False, "error": "Body must be a JSON object."}, HTTPStatus.BAD_REQUEST)
            return None
        return data

    def send_json(self, payload, status=HTTPStatus.OK):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        path = urlparse(self.path).path
        if path.startswith("/images/") or path.startswith("/vendor/"):
            self.send_header("Cache-Control", "public, max-age=604800")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("  %s  %s\n" % (self.log_date_time_string(), fmt % args))


# Make sure ES modules are served with a JS MIME type on every platform
# (Windows registry entries can otherwise map .js to text/plain).
GymRequestHandler.extensions_map.update({
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
})


def print_table(rows, empty_msg):
    if not rows:
        print(empty_msg)
        return
    for row in rows:
        print("-" * 60)
        for key, value in row.items():
            print(f"{key:>11}: {value}")
    print("-" * 60)
    print(f"{len(rows)} record(s)")


def main():
    parser = argparse.ArgumentParser(description="Run the IronPeak Fitness website.")
    parser.add_argument("--host", default="127.0.0.1", help="interface to bind (default 127.0.0.1)")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8000)))
    parser.add_argument("--open", action="store_true", help="open the site in your browser")
    parser.add_argument("--inquiries", action="store_true", help="list contact submissions and exit")
    parser.add_argument("--subscribers", action="store_true", help="list newsletter subscribers and exit")
    args = parser.parse_args()

    database.init_db()

    if args.inquiries:
        return print_table(database.list_inquiries(), "No inquiries yet.")
    if args.subscribers:
        return print_table(database.list_subscribers(), "No subscribers yet.")

    httpd = ThreadingHTTPServer((args.host, args.port), GymRequestHandler)
    url = f"http://{'localhost' if args.host in ('127.0.0.1', '0.0.0.0') else args.host}:{args.port}"
    chat_note = (f"ON  (OpenAI model: {chatbot.model_name()})" if chatbot.is_configured()
                 else "OFF - put your OPENAI_API_KEY in the .env file and restart")
    password_note ="default password - set IRONPEAK_ADMIN_PASSWORD to change it" \
        if "IRONPEAK_ADMIN_PASSWORD" not in os.environ else "password from IRONPEAK_ADMIN_PASSWORD"
    print(f"\n  IronPeak Fitness is live at  {url}"
          f"\n  Customer messages (admin):   {url}/admin"
          f"\n      username: {ADMIN_USER}   password: "
          f"{ADMIN_PASSWORD if 'IRONPEAK_ADMIN_PASSWORD' not in os.environ else '********'}  ({password_note})"
          f"\n  Chatbot: {chat_note}"
          f"\n  Database: {database.DB_PATH}\n  Press Ctrl+C to stop.\n", flush=True)
    if args.open:
        webbrowser.open(url)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  Server stopped.")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
