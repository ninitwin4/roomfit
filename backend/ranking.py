"""Deterministic ranking engine for roomfit.

Concept borrowed (not code) from the matching-engine project: hard filters
first, then a bounded, capped per-factor score, each factor emitting a plain
reason string. No LLM, no randomness -- same input always gives same output.

Scoring: 5 factors x 20 points = 0..100.
"""

from models import FactorScore, Preferences, RankedRoom, Room, Sleep

# --- config knobs (tweak behavior here, not in the logic) -------------------
# Budget is scored across a band around what the seeker said they can pay.
# Cheaper always scores higher; the band just decides how far the scale runs.
#
#   rent <= budget * (1 - BUDGET_COMFORT)  -> 20/20, comfortably affordable
#   rent == budget                         -> mid score, nothing left over
#   rent  = budget * (1 + BUDGET_STRETCH)  -> 0/20, the edge of what's shown
#   rent  > budget * (1 + BUDGET_STRETCH)  -> dropped by the hard filter
#
# Showing rooms a little over budget is deliberate: people do stretch, and a
# room 5% over is worth knowing about. Rooms over budget are always sorted
# below affordable ones (see rank), so the app never leads with one.
BUDGET_COMFORT = 0.30   # this far under budget earns full marks
BUDGET_STRETCH = 0.30   # this far over budget is still shown, scored low

FACTOR_MAX = 20  # every factor is scored out of this


def _over_budget(room: Room, prefs: Preferences) -> bool:
    """True when a room costs more than the seeker said they can pay."""
    return room.rent > prefs.budget_max


# --- hard filters -----------------------------------------------------------
def passes_filters(room: Room, prefs: Preferences) -> tuple[bool, str]:
    if room.rent > prefs.budget_max * (1 + BUDGET_STRETCH):
        return False, "far over budget"
    if prefs.needs_pets and not room.pets_allowed:
        return False, "pets not allowed"
    if not prefs.smoking_ok and room.smoking_allowed:
        return False, "smoking home"
    return True, ""


# --- individual factors -----------------------------------------------------
def _budget_factor(room: Room, prefs: Preferences) -> FactorScore:
    """Score price across the band, and say plainly why it landed there.

    The old version returned a bare "$1600 vs $1600 max ($0 under)", which
    stated the numbers but never the logic — so a room at the seeker's exact
    ceiling looked like a perfect match and scored near the bottom.
    """
    if prefs.budget_max <= 0:                 # guard: the form allows an empty budget
        return FactorScore(
            factor="Budget fit", score=0, max_score=FACTOR_MAX,
            reason="Set a budget to score this",
        )

    ratio = room.rent / prefs.budget_max
    span = BUDGET_COMFORT + BUDGET_STRETCH
    score = round(FACTOR_MAX * (1 + BUDGET_STRETCH - ratio) / span)
    score = max(0, min(FACTOR_MAX, score))

    diff = prefs.budget_max - room.rent
    if diff < 0:
        reason = f"${room.rent} — ${-diff} over your ${prefs.budget_max} budget"
    elif diff == 0:
        reason = f"${room.rent} — right at your limit, nothing left over"
    elif ratio <= 1 - BUDGET_COMFORT:
        reason = f"${room.rent} — comfortably under, ${diff} a month left over"
    else:
        reason = f"${room.rent} — ${diff} a month left over"

    return FactorScore(factor="Budget fit", score=score, max_score=FACTOR_MAX, reason=reason)


def _location_factor(room: Room, prefs: Preferences) -> FactorScore:
    if room.location.strip().lower() == prefs.location_pref.strip().lower():
        return FactorScore(factor="Location", score=20, max_score=FACTOR_MAX,
                           reason=f"Same area — {room.location}")
    return FactorScore(factor="Location", score=10, max_score=FACTOR_MAX,
                       reason=f"Different area — {room.location} (you wanted {prefs.location_pref})")


def _gap_factor(name: str, pref_val: int, room_val: int) -> FactorScore:
    gap = abs(pref_val - room_val)                # 0..4
    score = max(0, FACTOR_MAX - 5 * gap)
    if gap == 0:
        reason = f"{name} matches ({room_val}/5)"
    else:
        reason = f"{name} off by {gap} (room {room_val}/5 vs your {pref_val}/5)"
    return FactorScore(factor=name, score=score, max_score=FACTOR_MAX, reason=reason)


def _sleep_factor(room: Room, prefs: Preferences) -> FactorScore:
    r, p = room.sleep_schedule, prefs.sleep_pref
    if r == p:
        score, reason = 20, f"Same schedule ({p.value})"
    elif r == Sleep.flexible or p == Sleep.flexible:
        score, reason = 14, "Flexible schedule — compatible"
    else:
        score, reason = 6, f"Schedule clash ({r.value} vs your {p.value})"
    return FactorScore(factor="Sleep schedule", score=score, max_score=FACTOR_MAX, reason=reason)


# --- top-level ranking ------------------------------------------------------
def score_room(room: Room, prefs: Preferences) -> RankedRoom:
    factors = [
        _budget_factor(room, prefs),
        _location_factor(room, prefs),
        _gap_factor("Cleanliness", prefs.cleanliness_pref, room.cleanliness),
        _gap_factor("Social level", prefs.social_pref, room.social_level),
        _sleep_factor(room, prefs),
    ]
    total = sum(f.score for f in factors)
    return RankedRoom(room=room, total_score=total, factors=factors)


def rank(rooms: list[Room], prefs: Preferences) -> tuple[list[RankedRoom], int]:
    ranked: list[RankedRoom] = []
    filtered = 0
    for room in rooms:
        ok, _ = passes_filters(room, prefs)
        if not ok:
            filtered += 1
            continue
        ranked.append(score_room(room, prefs))
    # Affordable rooms always come first, however good an over-budget one looks
    # on the other four factors. Otherwise a great room 25% over budget outranks
    # an affordable ordinary one, and the app leads with something the seeker
    # just said they can't pay for. Within each group: best score, then cheaper.
    ranked.sort(
        key=lambda r: (_over_budget(r.room, prefs), -r.total_score, r.room.rent)
    )
    return ranked, filtered
