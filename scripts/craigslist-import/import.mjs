#!/usr/bin/env node
// Daily Craigslist import: San Francisco rooms with photos → inactive RoomFit
// rooms, waiting for the email bot to find each post's reply address.
//
//   node import.mjs                     the real thing (what launchd runs at 9:00)
//   node import.mjs --dry-run           scrape and check, write nothing
//   node import.mjs --dataset=<id>      reuse an earlier Apify run instead of
//                                       paying for a new scrape (any mode)
//
// No dependencies: Node 18+ fetch only. Signs in as an admin account, so the
// database's own rules apply — no service key anywhere. See README.md.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const DATASET = args.find((a) => a.startsWith("--dataset="))?.split("=")[1];

loadEnv(join(HERE, ".env"));
const SUPABASE_URL = need("SUPABASE_URL").replace(/\/$/, "");
const SUPABASE_KEY = need("SUPABASE_PUBLISHABLE_KEY");
const IMPORT_EMAIL = need("IMPORT_EMAIL");
const IMPORT_PASSWORD = need("IMPORT_PASSWORD");
const APIFY_TOKEN = need("APIFY_TOKEN");
const MAX_ITEMS = Number(process.env.MAX_ITEMS ?? 150);
const MAX_CHARGE_USD = Number(process.env.MAX_CHARGE_USD ?? 1);
// The SF list isn't in date order, and posts stay up about 30 days, so look
// back three weeks; posts already in RoomFit are skipped by their post key.
const LOOKBACK_HOURS = Number(process.env.LOOKBACK_HOURS ?? 504);

// San Francisco only (subarea sfc), rooms & shares, posts with photos, newest first.
const SEARCH_URL =
  "https://www.craigslist.org/search/subarea/sfc?cat=roo&hasPic=1&sort=date";
const ACTOR = "memo23~craigslist-scraper";
const BUCKET = "room-photos";
const PHOTOS_PER_ROOM = 3;
const DESCRIPTION_MAX = 2000; // matches 12_descriptions.sql
const RENT_MIN = 300; // below this it's a free room, a deposit or a typo
const RENT_MAX = 4000; // above this it's a whole flat posted under rooms

// ---------------------------------------------------------------------------
// Craigslist's San Francisco neighbourhoods → RoomFit's area names. Where
// RoomFit already has a name (even an untidy one), it's reused exactly: the
// ranking matches areas by exact text, so "Pac Heights" and "Pacific Heights"
// would never match each other.
const AREAS = {
  "alamo square / nopa": "NoPa",
  bayview: "Bayview",
  "bernal heights": "Bernal Heights",
  "castro / upper market": "Castro",
  "cole valley / ashbury hts": "Cole Valley",
  "downtown / civic / van ness": "Civic Center",
  "excelsior / outer mission": "Outer Mission/ Excelsior",
  "financial district": "Financial District",
  "glen park": "Glen Park",
  "haight ashbury": "Haight-Ashbury",
  "hayes valley": "Hayes Valley",
  "ingleside / sfsu / ccsf": "Ingleside",
  "inner richmond": "Inner Richmond",
  "inner sunset / ucsf": "Inner Sunset",
  "laurel hts / presidio": "Laurel Heights",
  "lower haight": "Lower Haight",
  "lower nob hill": "Nob Hill",
  "lower pac hts": "Lower Pac Heights",
  "marina / cow hollow": "Marina",
  "mission district": "Mission",
  "nob hill": "Nob Hill",
  "noe valley": "Noe Valley",
  "north beach / telegraph hill": "North Beach",
  "pacific heights": "Pac Heights",
  "portola district": "Portola",
  "potrero hill": "Potrero Hill",
  "richmond / seacliff": "Richmond District",
  "russian hill": "Russian Hill",
  "soma / south beach": "SoMa",
  "sunset / parkside": "Sunset",
  tenderloin: "Tenderloin",
  "treasure island": "Treasure Island",
  "twin peaks / diamond hts": "Twin Peaks",
  "usf / panhandle": "Panhandle",
  "visitacion valley": "Visitacion Valley",
  "west portal / forest hill": "West Portal",
  "western addition": "Western Addition",
};

// For posts that only say "san francisco" (or a name not above): the nearest
// area centre to the post's map pin, if it's within 1.5 km.
const CENTRES = {
  SoMa: [37.7785, -122.4056], Mission: [37.7599, -122.4148],
  Castro: [37.7609, -122.435], "Noe Valley": [37.7502, -122.4337],
  "Haight-Ashbury": [37.7692, -122.4481], "Lower Haight": [37.7717, -122.431],
  "Hayes Valley": [37.7759, -122.4245], "Western Addition": [37.7813, -122.432],
  NoPa: [37.7764, -122.442], "Pac Heights": [37.7925, -122.4382],
  "Lower Pac Heights": [37.786, -122.434], Marina: [37.8015, -122.4368],
  "Russian Hill": [37.8011, -122.4194], "Nob Hill": [37.793, -122.4161],
  "North Beach": [37.8061, -122.4103], "Financial District": [37.7946, -122.3999],
  Tenderloin: [37.7847, -122.4141], "Civic Center": [37.7793, -122.4176],
  "Potrero Hill": [37.7587, -122.4011], Dogpatch: [37.76, -122.388],
  "Mission Bay": [37.77, -122.392], "Bernal Heights": [37.7389, -122.4152],
  "Glen Park": [37.734, -122.4337], "Outer Mission/ Excelsior": [37.724, -122.428],
  Bayview: [37.729, -122.391], "Visitacion Valley": [37.713, -122.411],
  Portola: [37.727, -122.406], Ingleside: [37.721, -122.457],
  "West Portal": [37.74, -122.466], "Twin Peaks": [37.752, -122.447],
  "Inner Sunset": [37.762, -122.466], Sunset: [37.753, -122.493],
  "Inner Richmond": [37.78, -122.464], "Richmond District": [37.779, -122.492],
  "Laurel Heights": [37.786, -122.45], "Cole Valley": [37.765, -122.45],
  Panhandle: [37.772, -122.449],
};

// A generous box around the city: Daly City, the East Bay and Marin fall outside.
function inSanFrancisco(lat, lon) {
  return lat >= 37.7075 && lat <= 37.835 && lon >= -122.52 && lon <= -122.355;
}

function km(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLon = (b[1] - a[1]) * rad * Math.cos(((a[0] + b[0]) / 2) * rad);
  return 6371 * Math.hypot(dLat, dLon);
}

// Craigslist drops posts with no address onto the same spot in the middle of
// the city. A pin there says nothing about the neighbourhood.
const DEFAULT_PIN = [37.745, -122.4383];

function areaFor(hood, pin) {
  const named = AREAS[(hood ?? "").toLowerCase().replace(/\s+/g, " ").trim()];
  if (named) return named;
  if (!pin || km(pin, DEFAULT_PIN) < 0.05) return null;
  let best = null;
  for (const [name, centre] of Object.entries(CENTRES)) {
    const d = km(pin, centre);
    if (!best || d < best.d) best = { name, d };
  }
  return best && best.d <= 1.5 ? best.name : null;
}

// ---------------------------------------------------------------------------
// One scraped post → { room, source } or { skip: reason }.
function toListing(item) {
  const skip = (reason) => ({ skip: reason });
  const url = item.url ?? "";
  const key = item.id || url.split("/").pop();
  if (!/^https:\/\/[a-z.]*craigslist\.org\/view\//.test(url) || !key) return skip("no post link");

  const posted = item.datetime ? new Date(item.datetime) : null;
  if (posted && Date.now() - posted.getTime() > LOOKBACK_HOURS * 3600e3) return skip("older than the lookback window");

  const title = (item.title ?? "")
    .replace(/^\$[\d,]+\s*(\/\s*\d+\s*br\s*)?-\s*/i, "") // "$1,500 / 1br - " prefix
    .replace(/^\d+\s*br\s*-\s*/i, "") // "1br - " prefix
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  if (!title) return skip("no title");

  const rent = Number(String(item.price ?? "").replace(/[^\d.]/g, ""));
  if (!rent) return skip("no price");
  if (rent < RENT_MIN || rent > RENT_MAX) return skip("price out of range");

  const tags = (item.amenities ?? []).map((a) => String(a).toLowerCase());
  const period = (item.rentPeriod || tags.find((t) => ["daily", "weekly", "monthly"].includes(t)) || "").toLowerCase();
  if (period && period !== "monthly") return skip(`rent is ${period}`);
  if (tags.includes("room not private")) return skip("shared room");

  const lat = parseFloat(item.latitude);
  const lon = parseFloat(item.longitude);
  const pin = Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : null;
  if (pin && !inSanFrancisco(lat, lon)) return skip("outside San Francisco");
  const location = areaFor(item.location, pin);
  if (!location) return skip("can't place the neighbourhood");

  const photos = (item.pics ?? [])
    .filter((p) => /^https:\/\/images\.craigslist\.org\/\S+\.jpg$/.test(p))
    .slice(0, PHOTOS_PER_ROOM);
  if (photos.length === 0) return skip("no photos");

  let description = (item.post ?? "").replace(/QR Code Link to This Post/gi, "").trim();
  if (description.length > DESCRIPTION_MAX) {
    description = description.slice(0, DESCRIPTION_MAX - 1).replace(/\s+\S*$/, "") + "…";
  }

  return {
    key,
    photos,
    room: {
      title,
      rent: Math.round(rent),
      location,
      description: description || null,
      pets_allowed: tags.some((t) => t.startsWith("cats are ok") || t.startsWith("dogs are ok")),
      smoking_allowed: false,
    },
    source: {
      source: "craigslist",
      external_id: key,
      source_url: url,
      posted_at: posted ? posted.toISOString() : null,
      raw: item,
    },
  };
}

// ---------------------------------------------------------------------------
// Apify

async function apify(path, init = {}) {
  const res = await fetch(`https://api.apify.com/v2${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${APIFY_TOKEN}`, "Content-Type": "application/json", ...init.headers },
  });
  if (!res.ok) throw new Error(`Apify ${path} → ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function scrape() {
  if (DATASET) {
    log(`Reusing Apify dataset ${DATASET} (no new scrape).`);
    return apify(`/datasets/${DATASET}/items?clean=true&format=json`);
  }
  const input = {
    startUrls: [SEARCH_URL],
    includeDetails: true,
    extractReplyEmail: false, // never: that option works by solving Craigslist's hCaptcha
    maxItems: MAX_ITEMS,
    maxConcurrency: 5,
  };
  const { data: run } = await apify(
    `/acts/${ACTOR}/runs?maxTotalChargeUsd=${MAX_CHARGE_USD}&timeout=1800&memory=1024`,
    { method: "POST", body: JSON.stringify(input) }
  );
  log(`Apify run ${run.id} started.`);
  let state = run;
  while (!["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(state.status)) {
    ({ data: state } = await apify(`/actor-runs/${run.id}?waitForFinish=60`));
  }
  if (state.status !== "SUCCEEDED") throw new Error(`Apify run ${run.id} ended ${state.status}.`);
  log(`Apify run ${run.id} finished; cost $${(state.usageTotalUsd ?? 0).toFixed(3)}; dataset ${state.defaultDatasetId}.`);
  return apify(`/datasets/${state.defaultDatasetId}/items?clean=true&format=json`);
}

// ---------------------------------------------------------------------------
// Supabase, signed in as the import admin

let session = null;

async function supabase(path, { method = "GET", json, body, headers = {} } = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${session?.access_token ?? SUPABASE_KEY}`,
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path.split("?")[0]} → ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const rpc = (fn, params = {}) => supabase(`/rest/v1/rpc/${fn}`, { method: "POST", json: params });

async function signIn() {
  session = await supabase("/auth/v1/token?grant_type=password", {
    method: "POST",
    json: { email: IMPORT_EMAIL, password: IMPORT_PASSWORD },
  });
  if (!(await rpc("is_admin"))) {
    throw new Error(`${IMPORT_EMAIL} isn't an admin. Set profiles.role = 'admin' for it in the dashboard.`);
  }
}

// Copies one Craigslist photo into the import admin's own folder.
async function copyPhoto(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`photo ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > 3 * 1024 * 1024) throw new Error("photo over 3 MB");
  const path = `${session.user.id}/${randomUUID()}.jpg`;
  await supabase(`/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    body: bytes,
    headers: { "Content-Type": "image/jpeg", "x-upsert": "false" },
  });
  return { path, publicUrl: `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}` };
}

async function removePhotos(paths) {
  if (paths.length === 0) return;
  await supabase(`/storage/v1/object/${BUCKET}`, { method: "DELETE", json: { prefixes: paths } });
}

const pathOf = (publicUrl) => publicUrl.split(`/${BUCKET}/`)[1];

// ---------------------------------------------------------------------------

function log(...parts) {
  console.log(new Date().toISOString(), ...parts);
}

async function main() {
  log(DRY_RUN ? "Craigslist import — DRY RUN, nothing will be written." : "Craigslist import.");
  await signIn();

  const items = await scrape();
  log(`${items.length} posts scraped.`);

  const skipped = {};
  const candidates = [];
  for (const item of items) {
    const l = toListing(item);
    if (l.skip) skipped[l.skip] = (skipped[l.skip] ?? 0) + 1;
    else candidates.push(l);
  }

  const known = new Set(
    candidates.length ? await rpc("known_external_ids", { p_ids: candidates.map((c) => c.key) }) : []
  );
  if (known.size) skipped["already in RoomFit"] = known.size;

  // Hosts repost the same ad every few days under a new post key. A post with
  // the same title, rent and area as a room we already have (live or hidden) is
  // a repost, and so is a second copy inside this scrape.
  const sameAd = (r) => `${r.title.trim().toLowerCase()}|${r.rent}|${r.location}`;
  const haveAds = new Set(
    (await supabase("/rest/v1/rooms?select=title,rent,location&limit=10000")).map(sameAd)
  );
  const fresh = [];
  for (const c of candidates) {
    if (known.has(c.key)) continue;
    if (haveAds.has(sameAd(c.room))) {
      skipped["repost of a room in RoomFit"] = (skipped["repost of a room in RoomFit"] ?? 0) + 1;
      continue;
    }
    haveAds.add(sameAd(c.room));
    fresh.push(c);
  }

  let imported = 0;
  let failed = 0;
  for (const c of fresh) {
    if (DRY_RUN) {
      log(`would import: ${c.room.title} · $${c.room.rent} · ${c.room.location} · ${c.photos.length} photo(s)`);
      continue;
    }
    const uploaded = [];
    try {
      for (const p of c.photos) uploaded.push(await copyPhoto(p));
      const id = await rpc("import_listing", {
        p_room: { ...c.room, photos: uploaded.map((u) => u.publicUrl) },
        p_source: c.source,
      });
      if (id == null) {
        skipped["already in RoomFit"] = (skipped["already in RoomFit"] ?? 0) + 1;
        await removePhotos(uploaded.map((u) => u.path));
      } else {
        imported++;
        log(`imported #${id}: ${c.room.title} · $${c.room.rent} · ${c.room.location}`);
      }
    } catch (err) {
      failed++;
      log(`FAILED ${c.source.source_url}: ${err.message}`);
      await removePhotos(uploaded.map((u) => u.path)).catch(() => {});
    }
  }

  // Rooms that can't go anywhere any more (see delete_stale_imports).
  let removed = 0;
  if (!DRY_RUN) {
    const stale = await rpc("delete_stale_imports");
    removed = stale.length;
    const paths = stale.flatMap((r) => r.photos ?? []).map(pathOf).filter(Boolean);
    await removePhotos(paths).catch((err) => log(`photo cleanup: ${err.message}`));
  }

  log(
    `Done. ${DRY_RUN ? `${fresh.length} would be imported` : `${imported} imported, ${failed} failed`}, ` +
      `${removed} stale removed. Skipped: ${JSON.stringify(skipped)}`
  );
  if (failed) process.exitCode = 1;
}

// ---------------------------------------------------------------------------

function loadEnv(file) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return; // fine if the variables come from the environment instead
  }
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

function need(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
    process.exit(2);
  }
  return v;
}

export { toListing };

// A run that stops (most often: no network yet when the Mac wakes at 9:00) is
// tried again 2 hours later, at most 3 times. Re-running is safe: posts already
// in RoomFit are skipped by their post key.
const RETRIES = 3;
const RETRY_AFTER_MS = 2 * 60 * 60 * 1000;

async function runWithRetries() {
  for (let attempt = 0; ; attempt++) {
    try {
      await main();
      return;
    } catch (err) {
      if (attempt >= RETRIES || DRY_RUN) {
        log(`Import stopped: ${err.message}${attempt ? ` (after ${attempt} retries)` : ""}`);
        process.exitCode = 1;
        return;
      }
      log(`Import stopped: ${err.message}. Retry ${attempt + 1} of ${RETRIES} in 2 hours.`);
      await new Promise((r) => setTimeout(r, RETRY_AFTER_MS));
    }
  }
}

// Run only when executed, so the parser can be imported and tested on its own.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runWithRetries();
}
