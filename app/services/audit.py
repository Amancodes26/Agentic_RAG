import json
import sqlite3
from datetime import datetime, timezone
from app.core.config import get_settings

settings = get_settings()

def init_db() -> None:
    con = sqlite3.connect(settings.audit_db_path)
    con.execute(
        """CREATE TABLE IF NOT EXISTS query_audit (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            question TEXT NOT NULL,
            source_used TEXT NOT NULL,
            trace_json TEXT NOT NULL
        )"""
    )
    con.execute("CREATE TABLE IF NOT EXISTS demo_users (username_key TEXT PRIMARY KEY, display_name TEXT NOT NULL, created_at TEXT NOT NULL)")
    con.commit()
    con.close()


def register_demo_user(username: str) -> bool:
    """Register a demo workspace name. Returns True when it already existed."""
    key = username.strip().casefold()
    con = sqlite3.connect(settings.audit_db_path)
    existed = con.execute("SELECT 1 FROM demo_users WHERE username_key = ?", (key,)).fetchone() is not None
    con.execute("INSERT OR IGNORE INTO demo_users(username_key, display_name, created_at) VALUES (?, ?, ?)", (key, username.strip(), datetime.now(timezone.utc).isoformat()))
    con.commit()
    con.close()
    return existed

def write_audit(question: str, source_used: str, trace: list[str]) -> None:
    con = sqlite3.connect(settings.audit_db_path)
    con.execute(
        "INSERT INTO query_audit(created_at, question, source_used, trace_json) VALUES (?, ?, ?, ?)",
        (datetime.now(timezone.utc).isoformat(), question, source_used, json.dumps(trace)),
    )
    con.commit()
    con.close()
