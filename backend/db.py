"""
db.py — File-based "database" simulation
=========================================
In a real app this would be a SQLAlchemy session hitting Postgres, or a Redis
client for the session/token stores. Here every load/save is a JSON file read/write
so you can open the files in a text editor and watch them change in real time.

⚠ Not thread-safe — fine for a single-user demo, not for production.
   In production use atomic writes or a proper DB with transactions.
"""

import json
from pathlib import Path

# All JSON files live next to this module in the data/ folder
DATA_DIR = Path(__file__).parent / "data"


def _path(filename: str) -> Path:
    return DATA_DIR / filename


def load(filename: str, default):
    """Read a JSON file. Returns `default` if the file does not exist yet."""
    p = _path(filename)
    if not p.exists():
        return default
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)


def save(filename: str, data) -> None:
    """Write data back to a JSON file (pretty-printed so it's human-readable)."""
    with open(_path(filename), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
