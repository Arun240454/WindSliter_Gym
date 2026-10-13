"""SQLite schema, seed data and query helpers for IronPeak Fitness.

The database lives at data/ironpeak.db and is created (and seeded) automatically
the first time the server starts. Delete the file to reset everything.
"""

import os
import sqlite3
from contextlib import contextmanager

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "data", "ironpeak.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS plans (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    slug          TEXT UNIQUE NOT NULL,
    name          TEXT NOT NULL,
    tagline       TEXT NOT NULL,
    price_monthly REAL NOT NULL,
    price_annual  REAL NOT NULL,
    features      TEXT NOT NULL,          -- pipe-separated list
    featured      INTEGER NOT NULL DEFAULT 0,
    sort_order    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS trainers (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    role        TEXT NOT NULL,
    bio         TEXT NOT NULL,
    image       TEXT NOT NULL,
    specialties TEXT NOT NULL,            -- pipe-separated list
    years       INTEGER NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS classes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    day        TEXT NOT NULL,             -- Mon..Sun
    start_time TEXT NOT NULL,             -- HH:MM (24h)
    duration   INTEGER NOT NULL,          -- minutes
    name       TEXT NOT NULL,
    category   TEXT NOT NULL,
    trainer    TEXT NOT NULL,
    intensity  INTEGER NOT NULL,          -- 1..3
    spots      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS testimonials (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    detail     TEXT NOT NULL,
    quote      TEXT NOT NULL,
    rating     INTEGER NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS inquiries (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL,
    phone      TEXT,
    interest   TEXT NOT NULL,
    message    TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'new',   -- new | read | done
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subscribers (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    email      TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""

PLANS = [
    ("base", "Base Camp", "Everything you need to start strong.", 39, 390,
     "24/7 gym floor access|Locker room & showers|Free fitness assessment|IronPeak app access", 0, 1),
    ("summit", "Summit", "Our most popular all-access membership.", 69, 690,
     "Everything in Base Camp|Unlimited group classes|Recovery zone & sauna|2 guest passes / month|Monthly progress check-in", 1, 2),
    ("apex", "Apex Elite", "Coaching-led training for serious results.", 129, 1290,
     "Everything in Summit|4 personal training sessions / month|Custom nutrition plan|Priority class booking|Towel & laundry service", 0, 3),
]

TRAINERS = [
    ("Marcus Reid", "Head of Strength", "Former collegiate lineman who now builds raw strength and bulletproof technique in lifters of every level.",
     "/images/trainer-marcus.jpg", "Powerlifting|Hypertrophy|Technique", 12, 1),
    ("Elena Vasquez", "Functional Fitness Coach", "Turns complex movements into simple wins. Specialises in mobility-first strength and sustainable habits.",
     "/images/trainer-elena.jpg", "Functional|Mobility|Kettlebells", 9, 2),
    ("Dax Okafor", "Performance Coach", "Athletic performance specialist who programs explosive power, speed and conditioning for competitors.",
     "/images/trainer-dax.jpg", "Athletic Power|Conditioning|Olympic Lifts", 10, 3),
    ("Sofia Lindqvist", "HIIT & Core Lead", "High-energy coach behind our sold-out HIIT sessions. Precision core work, zero wasted minutes.",
     "/images/trainer-sofia.jpg", "HIIT|Core|Fat Loss", 7, 4),
]

# (day, time, duration, name, category, trainer, intensity, spots)
CLASSES = [
    ("Mon", "06:00", 45, "Sunrise Strength", "Strength", "Marcus Reid", 3, 14),
    ("Mon", "12:15", 30, "Lunch Burn HIIT", "HIIT", "Sofia Lindqvist", 3, 20),
    ("Mon", "18:00", 60, "Mobility Flow", "Yoga", "Elena Vasquez", 1, 18),
    ("Mon", "19:30", 50, "Power Circuit", "Conditioning", "Dax Okafor", 2, 16),
    ("Tue", "06:30", 45, "Kettlebell Forge", "Functional", "Elena Vasquez", 2, 14),
    ("Tue", "17:30", 45, "Core Crusher", "Core", "Sofia Lindqvist", 2, 20),
    ("Tue", "19:00", 60, "Barbell Club", "Strength", "Marcus Reid", 3, 12),
    ("Wed", "06:00", 30, "Sprint Intervals", "HIIT", "Dax Okafor", 3, 16),
    ("Wed", "12:15", 45, "Functional Fundamentals", "Functional", "Elena Vasquez", 1, 16),
    ("Wed", "18:30", 50, "Ignite HIIT", "HIIT", "Sofia Lindqvist", 3, 22),
    ("Thu", "06:30", 60, "Olympic Lifting Lab", "Strength", "Dax Okafor", 3, 10),
    ("Thu", "17:30", 60, "Restore Yoga", "Yoga", "Elena Vasquez", 1, 20),
    ("Thu", "19:00", 45, "Hypertrophy Hour", "Strength", "Marcus Reid", 2, 14),
    ("Fri", "06:00", 45, "Friday Forge", "Conditioning", "Dax Okafor", 3, 18),
    ("Fri", "12:15", 30, "Core Express", "Core", "Sofia Lindqvist", 2, 20),
    ("Fri", "17:30", 50, "Strength Social", "Strength", "Marcus Reid", 2, 16),
    ("Sat", "08:00", 60, "Weekend Warrior", "Conditioning", "Dax Okafor", 3, 24),
    ("Sat", "09:30", 60, "Power Yoga", "Yoga", "Elena Vasquez", 2, 20),
    ("Sat", "11:00", 45, "HIIT Takeover", "HIIT", "Sofia Lindqvist", 3, 24),
    ("Sun", "09:00", 75, "Deep Stretch & Breathe", "Yoga", "Elena Vasquez", 1, 20),
    ("Sun", "10:30", 60, "Open Barbell Clinic", "Strength", "Marcus Reid", 1, 12),
]

TESTIMONIALS = [
    ("Priya N.", "Member since 2022", "I came in unable to do a single push-up. Eighteen months later I deadlifted 1.5x my bodyweight. The coaches here genuinely care.", 5, 1),
    ("Jordan T.", "Summit member", "Best-equipped gym I've trained in, and somehow the friendliest. Sofia's HIIT classes are brutal in the best way.", 5, 2),
    ("Marco B.", "Apex Elite member", "The personal training plus nutrition plan was a game changer. Down 14 kg and stronger than I was at 25.", 5, 3),
    ("Aisha K.", "Member since 2021", "Spotless facility, zero intimidation, and the recovery zone is my weekly reset. I recommend IronPeak to everyone.", 5, 4),
]


def connect():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def db():
    conn = connect()
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    """Create tables and seed reference data if the tables are empty."""
    with db() as conn:
        conn.executescript(SCHEMA)
        # Upgrade databases created before the admin inbox existed.
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(inquiries)")}
        if "status" not in columns:
            conn.execute("ALTER TABLE inquiries ADD COLUMN status TEXT NOT NULL DEFAULT 'new'")
        if not conn.execute("SELECT 1 FROM plans LIMIT 1").fetchone():
            conn.executemany(
                "INSERT INTO plans (slug, name, tagline, price_monthly, price_annual, features, featured, sort_order)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?)", PLANS)
        if not conn.execute("SELECT 1 FROM trainers LIMIT 1").fetchone():
            conn.executemany(
                "INSERT INTO trainers (name, role, bio, image, specialties, years, sort_order)"
                " VALUES (?, ?, ?, ?, ?, ?, ?)", TRAINERS)
        if not conn.execute("SELECT 1 FROM classes LIMIT 1").fetchone():
            conn.executemany(
                "INSERT INTO classes (day, start_time, duration, name, category, trainer, intensity, spots)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?)", CLASSES)
        if not conn.execute("SELECT 1 FROM testimonials LIMIT 1").fetchone():
            conn.executemany(
                "INSERT INTO testimonials (name, detail, quote, rating, sort_order) VALUES (?, ?, ?, ?, ?)",
                TESTIMONIALS)


def _split(value):
    return [part for part in value.split("|") if part]


def get_plans():
    with db() as conn:
        rows = conn.execute("SELECT * FROM plans ORDER BY sort_order").fetchall()
    return [dict(r, features=_split(r["features"]), featured=bool(r["featured"])) for r in rows]


def get_trainers():
    with db() as conn:
        rows = conn.execute("SELECT * FROM trainers ORDER BY sort_order").fetchall()
    return [dict(r, specialties=_split(r["specialties"])) for r in rows]


def get_classes():
    with db() as conn:
        rows = conn.execute(
            "SELECT * FROM classes ORDER BY "
            "CASE day WHEN 'Mon' THEN 1 WHEN 'Tue' THEN 2 WHEN 'Wed' THEN 3 WHEN 'Thu' THEN 4 "
            "WHEN 'Fri' THEN 5 WHEN 'Sat' THEN 6 ELSE 7 END, start_time").fetchall()
    return [dict(r) for r in rows]


def get_testimonials():
    with db() as conn:
        rows = conn.execute("SELECT * FROM testimonials ORDER BY sort_order").fetchall()
    return [dict(r) for r in rows]


def add_inquiry(name, email, phone, interest, message):
    with db() as conn:
        cur = conn.execute(
            "INSERT INTO inquiries (name, email, phone, interest, message) VALUES (?, ?, ?, ?, ?)",
            (name, email, phone, interest, message))
        return cur.lastrowid


def add_subscriber(email):
    """Returns True if newly added, False if the email was already subscribed."""
    with db() as conn:
        cur = conn.execute("INSERT OR IGNORE INTO subscribers (email) VALUES (?)", (email,))
        return cur.rowcount == 1


def list_inquiries():
    with db() as conn:
        return [dict(r) for r in conn.execute("SELECT * FROM inquiries ORDER BY id DESC").fetchall()]


def list_subscribers():
    with db() as conn:
        return [dict(r) for r in conn.execute("SELECT * FROM subscribers ORDER BY id DESC").fetchall()]


INQUIRY_STATUSES = ("new", "read", "done")


def set_inquiry_status(inquiry_id, status):
    """Returns True if the inquiry existed and was updated."""
    with db() as conn:
        cur = conn.execute("UPDATE inquiries SET status = ? WHERE id = ?", (status, inquiry_id))
        return cur.rowcount == 1


def delete_inquiry(inquiry_id):
    with db() as conn:
        return conn.execute("DELETE FROM inquiries WHERE id = ?", (inquiry_id,)).rowcount == 1


def delete_subscriber(subscriber_id):
    with db() as conn:
        return conn.execute("DELETE FROM subscribers WHERE id = ?", (subscriber_id,)).rowcount == 1
