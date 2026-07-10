"""roomfit ranking API.

Stateless service: takes seeker Preferences, ranks the seed rooms, returns
ranked rooms with per-factor reasons. In Week 2 the room list will come from
Supabase instead of the local JSON, but this endpoint stays the same shape.
"""

import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from models import Preferences, RankResponse, Room
from ranking import rank

app = FastAPI(title="roomfit ranking")

# open CORS for local dev; tighten to the Vercel origin at deploy time
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

SEED_PATH = Path(__file__).parent / "seed_rooms.json"
SEED_ROOMS = [Room(**r) for r in json.loads(SEED_PATH.read_text())]


@app.get("/health")
def health():
    return {"ok": True, "rooms": len(SEED_ROOMS)}


@app.post("/rank", response_model=RankResponse)
def rank_rooms(prefs: Preferences):
    results, filtered = rank(SEED_ROOMS, prefs)
    return RankResponse(results=results, filtered_out=filtered)
