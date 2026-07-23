"""roomfit ranking API.

Stateless by design: the frontend reads rooms from Supabase and posts them here
along with the seeker's preferences. This service holds no database
credentials and no user data — it just scores and explains.

If `rooms` is omitted from the request, the local seed file is used instead,
which keeps curl and local dev easy.
"""

import json
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from models import RankRequest, RankResponse, Room
from ranking import rank

app = FastAPI(title="roomfit ranking")

# Set ALLOWED_ORIGINS on Render to your Vercel URL, comma separated.
# Falls back to open CORS for local dev.
_origins = os.getenv("ALLOWED_ORIGINS", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)

SEED_PATH = Path(__file__).parent / "seed_rooms.json"
SEED_ROOMS = [Room(**r) for r in json.loads(SEED_PATH.read_text())]


@app.get("/health")
def health():
    return {"ok": True, "seed_rooms": len(SEED_ROOMS)}


@app.post("/rank", response_model=RankResponse)
def rank_rooms(req: RankRequest):
    rooms = req.rooms if req.rooms is not None else SEED_ROOMS
    results, filtered = rank(rooms, req.preferences)
    return RankResponse(results=results, filtered_out=filtered)
