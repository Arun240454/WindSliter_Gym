# IronPeak Fitness — Gym Website

**[▶ Live demo](https://arun240454.github.io/WindSliter_Gym/)** · [Claude artifact](https://claude.ai/artifact/VmeehgVPM2dub1JffN234o) (the demo runs in the browser with the API mocked; use `python server.py` for the full project)

A full-stack website for **IronPeak Fitness**, a premium strength and conditioning gym.

- **Frontend:** HTML, CSS and JavaScript (ES modules) with a Three.js WebGL hero, 3D tilt cards, flip cards, a draggable 3D gallery carousel, a coverflow testimonial slider, and scroll-driven reveal and parallax animations.
- **Backend:** Python 3 standard library only (`http.server` + `sqlite3`). There is **nothing to `pip install`**.
- **Database:** SQLite (`data/ironpeak.db`). It is created and seeded automatically on first run.

## Quick start

Requirements: **Python 3.8+**. Any modern browser works.

```bash
cd WindSliter_Gym
python server.py
```

Open **http://localhost:8000** in your browser.

To have the server open the browser for you, use `python server.py --open`. Press `Ctrl+C` to stop the server.

| Command | What it does |
|---|---|
| `python server.py --port 9000` | Run on a different port |
| `python server.py --host 0.0.0.0` | Make the site reachable from other devices on your network |
| `python server.py --inquiries` | Print every contact-form submission |
| `python server.py --subscribers` | Print newsletter sign-ups |

To reset all data, stop the server, delete `data/ironpeak.db` and start the server again. The database is recreated and reseeded.

## AI chatbot (bottom-right corner)

The site has a chat assistant called **Peak**. It uses OpenAI's **gpt-4o-mini** model and answers **only** from the gym guide in [knowledge/ironpeak_gym_guide.md](knowledge/ironpeak_gym_guide.md), which covers plans, prices, policies, the free trial, classes, coaches, facilities, hours and FAQs. If a question isn't about the gym (for example "how do I make a pizza?"), Peak replies that it can only answer from the gym document.

**To turn it on:**

1. Open the `.env` file in the project folder. If it doesn't exist, copy `.env.example` to `.env`.
2. Replace `sk-your-key-here` with your OpenAI API key:
   ```
   OPENAI_API_KEY=sk-proj-...your real key...
   ```
3. Restart the server (`Ctrl+C`, then `python server.py`). The terminal should show `Chatbot: ON (OpenAI model: gpt-4o-mini)`.

**To change what the bot knows:** edit `knowledge/ironpeak_gym_guide.md` and save it. The bot uses the new text on the next question, with no restart needed. If you change prices in `database.py`, update the guide as well so the website and the bot match.

**To use a different model:** set `OPENAI_MODEL` in `.env`, for example `gpt-4o` or `gpt-4.1-mini`.

**Safety and cost controls:**

- Your API key stays on the server. It is never sent to the browser.
- Each visitor can send at most 20 messages per minute.
- Only the last 10 messages of a conversation are sent to OpenAI, and each reply is capped at 500 tokens.
- With no key set, the chat bubble still appears but tells visitors to call or use the contact form instead.

`.env` is listed in `.gitignore`, so your key won't be committed if you put the project in git.

## Reading customer messages

When a visitor fills in the contact form and clicks **Send Message**, the message is saved straight away to the `inquiries` table in `data/ironpeak.db`. There is nothing to configure.

To read the messages, open the admin inbox while the server is running:

**http://localhost:8000/admin**

| | |
|---|---|
| Username | `admin` |
| Password | `ironpeak` |

In the inbox you can:

- See each message with the customer's name, email, phone number, interest and the time it was sent.
- Search the messages and filter them by status or interest.
- Mark a message as read, handled or unread, reply by email, or delete it.
- Download all messages as a CSV file that opens in Excel or Google Sheets.
- See newsletter sign-ups on a separate tab.

The inbox refreshes itself every 15 seconds, so new messages appear without reloading the page.

**Change the default password** before anyone else can reach the server. Set the `IRONPEAK_ADMIN_PASSWORD` environment variable before you start it:

```powershell
# Windows PowerShell
$env:IRONPEAK_ADMIN_PASSWORD = "choose-a-strong-password"; python server.py
```
```bash
# macOS / Linux
IRONPEAK_ADMIN_PASSWORD="choose-a-strong-password" python server.py
```

You can also open `data/ironpeak.db` in any SQLite viewer, such as [DB Browser for SQLite](https://sqlitebrowser.org), or print the messages in the terminal with `python server.py --inquiries`.

## Project structure

```
WindSliter_Gym/
├── server.py            # HTTP server: static files + JSON API
├── database.py          # SQLite schema, seed data, queries
├── chatbot.py           # OpenAI chatbot (answers only from the gym guide)
├── .env                 # Your settings: OPENAI_API_KEY, admin password (keep private)
├── .env.example         # Template for .env
├── knowledge/
│   └── ironpeak_gym_guide.md   # The document the chatbot answers from
├── admin/
│   └── index.html       # Customer-message inbox (served at /admin, login required)
├── data/
│   └── ironpeak.db      # SQLite database (auto-created)
└── static/
    ├── index.html       # Single-page site
    ├── css/styles.css   # All styling and animations
    ├── js/main.js       # UI behaviour, API calls, gallery, forms
    ├── js/hero3d.js     # Three.js 3D hero scene
    ├── vendor/three.module.min.js   # Three.js r160 (bundled locally, works offline)
    └── images/          # 28 optimized gym photos + favicon
```

## Sections

Navigation (sticky, with a mobile menu) · Hero (3D WebGL scene) · About · Programs · Class schedule · Membership pricing (monthly/annual toggle) · Free-trial banner · Coaches · Gallery (3D carousel + lightbox) · Testimonials · Contact form · Footer with newsletter sign-up.

The schedule, pricing, coaches and testimonials sections are loaded from the database through the API. Edit the seed lists in `database.py` and reset the database to change them.

## API

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/plans` | Membership plans |
| GET | `/api/classes` | Weekly class timetable |
| GET | `/api/trainers` | Coach profiles |
| GET | `/api/testimonials` | Member testimonials |
| GET | `/api/health` | Health check |
| POST | `/api/contact` | `{name, email, phone?, interest, message}` — validated, then stored in `inquiries` |
| POST | `/api/newsletter` | `{email}` — stored in `subscribers` (duplicates ignored) |
| POST | `/api/chat` | `{messages: [{role, content}, …]}` → `{ok, reply}` — chatbot answer |
| GET | `/api/chat/status` | `{enabled}` — whether an OpenAI key is configured |
| GET | `/admin` | Admin inbox page 🔒 |
| GET | `/api/admin/inquiries` · `/api/admin/subscribers` | All messages / subscribers as JSON 🔒 |
| GET | `/api/admin/inquiries.csv` · `/api/admin/subscribers.csv` | CSV download 🔒 |
| PATCH | `/api/admin/inquiries/<id>` | `{status: "new" \| "read" \| "done"}` 🔒 |
| DELETE | `/api/admin/inquiries/<id>` · `/api/admin/subscribers/<id>` | Delete a record 🔒 |

🔒 = needs the admin username and password (HTTP Basic auth).

## Database schema

`plans`, `trainers`, `classes` and `testimonials` hold the site content. `inquiries` and `subscribers` hold visitor submissions. See `SCHEMA` in [database.py](database.py).

## Notes

- **Images** are real photos from [Unsplash](https://unsplash.com) (free to use under the Unsplash License). They were downloaded at web-optimized sizes (about 80–380 KB each) and are served locally, so nothing breaks if a remote link changes.
- **Fonts** (Anton and Inter) load from Google Fonts. When you're offline the site falls back to system fonts.
- **Performance:** the 3D scene pauses when it's off-screen or the tab is hidden. The pixel ratio is capped, and images below the fold are lazy-loaded.
- **Accessibility:** animations respect `prefers-reduced-motion`, and the site supports keyboard navigation (coach cards, lightbox arrows and Esc).
- **Business details:** the address, phone number, coaches and testimonials are sample content for this fictional gym.
