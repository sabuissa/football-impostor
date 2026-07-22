#!/usr/bin/env node
/**
 * One-off data-builder for the "Career Paths" game.
 *
 * What it does:
 *   1. Reads the player name lists below (easy / medium / hard).
 *   2. For each unique name, calls api-football.com to resolve it to a player ID + photo.
 *   3. Fetches that player's team history (and merges in any loan spells the
 *      team-history endpoint misses, via the transfers endpoint) into an
 *      ordered list of { club, startYear, endYear } "spells".
 *   4. Drops any player with fewer than 4 senior club stints (national teams excluded;
 *      a repeat spell at a club the player left and later rejoined counts again).
 *   5. Writes the survivors to ../js/careerPlayers.js as a plain `const careerPlayers = {...}`.
 *
 * This script is NOT part of the game itself and is never loaded by index.html.
 * You run it once (or a few times, since the free API plan caps you at 100
 * requests/day) to regenerate js/careerPlayers.js, then the game just reads
 * that static file.
 *
 * Usage:
 *   node scripts/buildPlayers.js
 *
 * Requires a `.env` file next to this repo's root containing:
 *   API_FOOTBALL_KEY=your_key_here
 *
 * Progress is checkpointed in scripts/.cache/players.json, so if you run out
 * of daily requests partway through, just run the script again tomorrow and
 * it will pick up where it left off (already-resolved players are read from
 * the cache instead of hitting the API again).
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');
const CACHE_DIR = path.join(__dirname, '.cache');
const CACHE_PATH = path.join(CACHE_DIR, 'players.json');
const OUTPUT_PATH = path.join(ROOT, 'js', 'careerPlayers.js');

const API_BASE = 'https://v3.football.api-sports.io';
const MIN_CLUBS = 4; // hard rule: drop anyone with fewer than this many senior club stints (a return to a previous club counts again)
// The free plan's real cap is 10 requests/minute (learned the hard way -- not
// documented on /status). 6.5s keeps us under 10/min with a little headroom.
const DELAY_BETWEEN_REQUESTS_MS = 6500;
const SAFETY_BUFFER_REQUESTS = 3; // leave a little headroom under the daily cap

// Player name lists, exactly as provided. Duplicate names across tiers
// (e.g. Álvaro Morata in easy+medium, Andriy Yarmolenko in medium+hard) are
// kept intentionally -- each name is only *resolved* once, but can appear in
// more than one tier's output. Literal duplicate entries within the same
// tier (Islam Slimani and Cenk Tosun appear twice in HARD) are de-duped.
const NAME_TIERS = {
  easy: [
    'Cristiano Ronaldo', 'Kylian Mbappé', 'Neymar', 'Mohamed Salah', 'Kevin De Bruyne',
    'Harry Kane', 'Robert Lewandowski', 'Luka Modrić', 'Bukayo Saka', 'Antoine Griezmann',
    'Son Heung-min', 'Karim Benzema', 'Sergio Ramos', 'Virgil van Dijk', 'Sadio Mané',
    'Raheem Sterling', 'Casemiro', 'Alexis Mac Allister', 'Marcus Rashford', 'Achraf Hakimi',
    'Julián Álvarez', 'Michael Olise', 'Kai Havertz', 'Álvaro Morata', 'Memphis Depay',
    'Pierre-Emerick Aubameyang', 'Wojciech Szczęsny',
  ],
  medium: [
    'Victor Osimhen', 'Rafael Leão', 'Randal Kolo Muani', 'Khvicha Kvaratskhelia', 'Theo Hernández',
    'João Cancelo', 'Thibaut Courtois', 'Christopher Nkunku', 'Ousmane Dembélé', 'Serhou Guirassy',
    'Benjamin Šeško', 'Marc Cucurella', 'Federico Chiesa', 'Álvaro Morata', 'James Rodríguez',
    'Julian Draxler', 'Piotr Zieliński', 'Wissam Ben Yedder', 'Nabil Fekir', 'Anthony Martial',
    'Jesse Lingard', 'Ruben Loftus-Cheek', 'Aleksandar Mitrović', 'Luka Jović', 'Andriy Yarmolenko',
    'Marko Arnautović', 'Arkadiusz Milik', 'Moussa Dembélé', 'Sébastien Haller', 'Gerard Deulofeu',
  ],
  hard: [
    'Mario Balotelli', 'Islam Slimani', 'Cenk Tosun', 'Vincent Aboubakar', 'Steven Nzonzi',
    "M'Baye Niang", 'Stephan El Shaarawy', 'Éver Banega', 'Franck Kessié', 'Kevin Gameiro',
    'Suso', 'Denis Suárez', 'Sardar Azmoun', 'Mehdi Taremi', 'Malcom',
    'Amadou Haïdara', 'Boubacar Kamara', 'Takefusa Kubo', 'Rasmus Højlund', 'Elye Wahi',
    'Hugo Ekitiké', 'Adnan Januzaj', 'Ross Barkley', 'Dele Alli', 'Danny Ings',
    'Krzysztof Piątek', 'Jean-Philippe Mateta', 'Munir El Haddadi', 'Alexander Isak', 'Viktor Gyökeres',
    'Dominik Livaković', 'Salomón Rondón',
  ],
};

// Backup list of national-team names to exclude from the club count, in
// addition to matching against each player's own nationality field. Not
// exhaustive -- just covers the countries likely to show up for this roster.
const NATIONAL_TEAM_NAMES = new Set([
  'portugal', 'france', 'brazil', 'egypt', 'belgium', 'england', 'poland', 'croatia', 'argentina',
  'spain', 'netherlands', 'senegal', 'korea republic', 'south korea', 'morocco', 'cameroon',
  'germany', 'ukraine', 'serbia', 'nigeria', 'ivory coast', "cote d'ivoire", 'iran', 'japan',
  'denmark', 'sweden', 'norway', 'italy', 'turkey', 'ghana', 'mali', 'guinea', 'austria',
  'switzerland', 'wales', 'scotland', 'northern ireland', 'republic of ireland', 'ireland',
  'usa', 'united states', 'canada', 'mexico', 'colombia', 'uruguay', 'chile', 'peru', 'ecuador',
  'venezuela', 'bolivia', 'paraguay', 'costa rica', 'panama', 'jamaica', 'qatar', 'saudi arabia',
  'israel', 'iceland', 'slovenia', 'slovakia', 'czech republic', 'hungary', 'romania', 'bulgaria',
  'greece', 'russia', 'finland', 'albania', 'north macedonia', 'montenegro', 'bosnia and herzegovina',
  'kosovo', 'georgia', 'armenia', 'azerbaijan', 'algeria', 'tunisia', 'dr congo', 'zambia',
  'south africa', 'kenya', 'angola', 'gabon', 'burkina faso', 'equatorial guinea', 'mali u23',
  'slovenia u21', 'venezuela u23',
]);

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

function normalize(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

// The API's search field rejects anything but ASCII letters/digits/spaces
// (accented letters, apostrophes, hyphens all 400). Strip accents down to
// their base letter, then blank out anything else non-alphanumeric.
function sanitizeForSearch(name) {
  return normalize(name)
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Youth academy / reserve / national-youth squads aren't "senior clubs" --
// exclude them so they don't inflate a player's distinct-club count.
const YOUTH_OR_RESERVE_PATTERN = /\bu-?\d{1,2}\b|\breserves?\b|\byouth\b|\bacademy\b|\bcastilla\b|\bii\b/;

function isNonSeniorTeam(teamName, nationality) {
  const normalizedTeam = normalize(teamName);
  const normalizedNationality = nationality ? normalize(nationality) : null;

  if (normalizedTeam === normalizedNationality || NATIONAL_TEAM_NAMES.has(normalizedTeam)) {
    return 'national team';
  }
  if (YOUTH_OR_RESERVE_PATTERN.test(normalizedTeam)) {
    return 'youth/reserve team';
  }
  // "<Nationality> B" or "<Nationality> U19" etc. -- catches national youth
  // sides that aren't in NATIONAL_TEAM_NAMES and don't match nationality exactly.
  if (normalizedNationality && normalizedTeam.startsWith(`${normalizedNationality} `)) {
    return 'national youth team';
  }
  if (/\bb$/.test(normalizedTeam)) {
    return 'reserve team';
  }
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadCache() {
  if (!fs.existsSync(CACHE_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveCache(cache) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

let requestCount = 0;

async function apiGet(apiKey, endpoint, params, retriesLeft = 1) {
  const url = new URL(API_BASE + endpoint);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  requestCount += 1;
  await sleep(DELAY_BETWEEN_REQUESTS_MS);
  const res = await fetch(url, { headers: { 'x-apisports-key': apiKey } });

  if (res.status === 429 && retriesLeft > 0) {
    // Hit the per-minute cap despite our pacing -- back off a full minute and retry once.
    console.log('  (rate limited, waiting 65s before retrying...)');
    await sleep(65000);
    return apiGet(apiKey, endpoint, params, retriesLeft - 1);
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  const json = await res.json();
  if (json.errors && Array.isArray(json.errors) ? json.errors.length : Object.keys(json.errors || {}).length) {
    throw new Error(`API error for ${url}: ${JSON.stringify(json.errors)}`);
  }
  return json;
}

async function getStatus(apiKey) {
  const json = await apiGet(apiKey, '/status', {});
  return json.response;
}

// A full "Firstname Lastname" search is dangerously unreliable on this API:
// - It sometimes matches exactly one WRONG player because the API's `name`
//   field for obscure players happens to literally equal the full spelled-out
//   name (e.g. searching "Robert Lewandowski" returns exactly one hit -- an
//   unrelated retired goalkeeper named "Robert Lewandowski" -- while the real
//   Lewandowski is stored as "R. Lewandowski" and never turns up). A single
//   non-empty result is therefore NOT proof of a correct match.
// - It sometimes returns zero results for very famous players (e.g. "Kevin De
//   Bruyne" -> 0, but "Bruyne" alone -> matches).
// So: always also try the last-name-only search when there's more than one
// token, pool both candidate sets together, and pick the best match by (1)
// how many of the input's name tokens it contains and (2) profile
// completeness (height/weight/shirt number) -- obscure/placeholder records
// tend to have these fields null, while the real, famous player doesn't.
function profileCompleteness(player) {
  return [player.height, player.weight, player.number].filter((v) => v !== null && v !== undefined).length;
}

async function searchPlayer(apiKey, name) {
  const sanitized = sanitizeForSearch(name);
  const targetTokens = sanitized.split(' ').filter(Boolean);

  const byId = new Map();
  const addCandidates = (response) => {
    for (const c of response || []) byId.set(c.player.id, c.player);
  };

  const primaryJson = await apiGet(apiKey, '/players/profiles', { search: sanitized });
  addCandidates(primaryJson.response);

  if (targetTokens.length > 1) {
    // The API rejects search terms under 4 characters ("min" from "Heung-min"
    // is only 3), so fall back to the last TWO tokens in that case.
    let fallbackQuery = targetTokens[targetTokens.length - 1];
    if (fallbackQuery.length < 4) {
      fallbackQuery = targetTokens.slice(-2).join(' ');
    }
    const fallbackJson = await apiGet(apiKey, '/players/profiles', { search: fallbackQuery });
    addCandidates(fallbackJson.response);
  }

  const candidates = [...byId.values()];
  if (candidates.length === 0) return { player: null, ambiguous: false };

  const scored = candidates
    .map((player) => {
      const candidateTokens = new Set(
        normalize(`${player.firstname || ''} ${player.lastname || ''}`).split(' ').filter(Boolean)
      );
      const matchCount = targetTokens.filter((t) => candidateTokens.has(t)).length;
      // A mononym star (e.g. "Casemiro") is often stored with `name` set to
      // exactly that -- a strong signal over an obscure namesake whose
      // profile happens to be more "complete" by coincidence.
      const exactNameFieldMatch = normalize(player.name || '') === sanitized;
      return {
        player,
        matchCount,
        fullMatch: matchCount === targetTokens.length,
        exactNameFieldMatch,
        completeness: profileCompleteness(player),
      };
    })
    .sort(
      (a, b) =>
        b.matchCount - a.matchCount ||
        Number(b.exactNameFieldMatch) - Number(a.exactNameFieldMatch) ||
        b.completeness - a.completeness
    );

  const best = scored[0];
  const tiedForBest = scored.filter((s) => s.matchCount === best.matchCount).length;
  const ambiguous = !best.fullMatch || tiedForBest > 1;

  return {
    player: best.player,
    ambiguous,
    // Only populated when ambiguous, so callers can log it for manual review.
    candidateSummary: ambiguous
      ? scored.slice(0, 5).map((s) => `${s.player.name} (id ${s.player.id}, ${s.player.nationality || '?'})`)
      : null,
  };
}

// /players/teams under-reports lower-league and short loan spells (e.g. it's
// missing Harry Kane's Norwich and Leicester loans entirely). /transfers
// often has the ones /players/teams misses, and explicitly flags loans with
// type "Loan" -- so we fetch it too and merge in any club it mentions that
// isn't already accounted for.
async function fetchTransfers(apiKey, playerId) {
  const json = await apiGet(apiKey, '/transfers', { player: playerId });
  const records = json.response && json.response[0] ? json.response[0].transfers : [];

  return records
    .filter((t) => t.date && t.teams)
    .map((t) => ({
      year: Number(t.date.slice(0, 4)),
      teamIn: t.teams.in ? t.teams.in.name : null,
      teamOut: t.teams.out ? t.teams.out.name : null,
    }))
    .sort((a, b) => a.year - b.year);
}

async function fetchCareer(apiKey, playerId, nationality) {
  const json = await apiGet(apiKey, '/players/teams', { player: playerId });
  const entries = json.response || [];

  const spells = [];
  const excludedTeams = [];

  for (const entry of entries) {
    const teamName = entry.team.name;
    const exclusionReason = isNonSeniorTeam(teamName, nationality);

    if (exclusionReason) {
      excludedTeams.push(`${teamName} (${exclusionReason})`);
      continue;
    }

    const seasons = [...(entry.seasons || [])].sort((a, b) => a - b);
    if (seasons.length === 0) continue;

    // Split into separate spells when there's a gap of more than 1 year,
    // so a player who left and later rejoined the same club gets two entries
    // instead of one that pretends the years in between were continuous.
    let spellStart = seasons[0];
    let prev = seasons[0];
    for (let i = 1; i <= seasons.length; i += 1) {
      const current = seasons[i];
      if (current === undefined || current - prev > 1) {
        spells.push({ club: teamName, startYear: spellStart, endYear: prev });
        if (current !== undefined) spellStart = current;
      }
      prev = current;
    }
  }

  // Fill in any club /players/teams missed using /transfers. We only have a
  // single transfer date to go on for these (not a full season range), so
  // they're recorded as a one-year stint -- approximate, but far better than
  // silently dropping a real loan spell.
  const transfers = await fetchTransfers(apiKey, playerId);
  const knownClubKeys = new Set(spells.map((s) => normalize(s.club)));

  for (const t of transfers) {
    for (const clubName of [t.teamIn, t.teamOut]) {
      if (!clubName) continue;
      const key = normalize(clubName);
      if (knownClubKeys.has(key)) continue;

      const exclusionReason = isNonSeniorTeam(clubName, nationality);
      if (exclusionReason) {
        excludedTeams.push(`${clubName} (${exclusionReason})`);
        knownClubKeys.add(key);
        continue;
      }

      knownClubKeys.add(key);
      spells.push({ club: clubName, startYear: t.year, endYear: t.year });
    }
  }

  spells.sort((a, b) => a.startYear - b.startYear);
  return { spells, excludedTeams };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const env = { ...loadEnvFile(ENV_PATH), ...process.env };
  const apiKey = env.API_FOOTBALL_KEY;
  if (!apiKey) {
    console.error('Missing API_FOOTBALL_KEY. Add it to a .env file at the repo root.');
    process.exit(1);
  }

  console.log('Checking API quota...');
  const status = await getStatus(apiKey);
  const remainingToday = status.requests.limit_day - status.requests.current;
  const budget = remainingToday - SAFETY_BUFFER_REQUESTS;
  console.log(
    `Plan: ${status.subscription.plan} | used today: ${status.requests.current}/${status.requests.limit_day} | budget for this run: ${budget} requests`
  );
  if (budget <= 0) {
    console.log('No request budget left for today. Run again after your daily quota resets.');
    return;
  }

  // Build the de-duplicated list of unique names to resolve, preserving the
  // first tier each name appears in for logging purposes.
  const uniqueNames = [];
  const seen = new Set();
  for (const tier of Object.values(NAME_TIERS)) {
    for (const name of tier) {
      const key = normalize(name);
      if (!seen.has(key)) {
        seen.add(key);
        uniqueNames.push(name);
      }
    }
  }

  const cache = loadCache();
  const dropped = [];
  const notFound = [];
  const ambiguousPicks = [];
  const failures = [];
  let ranOutOfBudget = false;

  console.log(`${uniqueNames.length} unique player names total. ${Object.keys(cache).length} already resolved from a previous run.\n`);

  for (const name of uniqueNames) {
    const key = normalize(name);
    if (cache[key]) {
      continue; // already resolved (kept or dropped) in a previous run
    }

    // Budget check uses the real request count (every attempt, success or
    // failure, consumes it) so we don't blow past the daily cap on a run
    // full of errors.
    if (requestCount + 2 > budget) {
      console.log(`\nStopping early to respect the daily rate limit (${budget} request budget reached).`);
      console.log(`${uniqueNames.length - Object.keys(cache).length} names still unresolved -- run this script again (tomorrow, if on the free plan) to continue.`);
      ranOutOfBudget = true;
      break;
    }

    process.stdout.write(`Resolving "${name}"... `);
    try {
      const { player, ambiguous, candidateSummary } = await searchPlayer(apiKey, name);

      if (!player) {
        console.log('NOT FOUND');
        notFound.push(name);
        cache[key] = { status: 'not_found', name };
        saveCache(cache);
        continue;
      }

      if (ambiguous) {
        ambiguousPicks.push({ name, picked: player.name, id: player.id, candidates: candidateSummary });
      }

      const { spells, excludedTeams } = await fetchCareer(apiKey, player.id, player.nationality);

      // Count STOPS (stints), not distinct clubs -- a player who left and
      // later rejoined the same club (e.g. Griezmann: Real Sociedad,
      // Atletico, Barcelona, Atletico again) should have that return trip
      // count toward the minimum, not get collapsed away.
      const stintClubNames = spells.map((s) => s.club);

      if (stintClubNames.length < MIN_CLUBS) {
        console.log(`DROPPED (${stintClubNames.length} stint${stintClubNames.length === 1 ? '' : 's'}: ${stintClubNames.join(', ') || 'none'})`);
        dropped.push({ name, stintCount: stintClubNames.length, clubs: stintClubNames });
        cache[key] = { status: 'dropped', name, stintCount: stintClubNames.length, clubs: stintClubNames };
        saveCache(cache);
        continue;
      }

      console.log(`kept (${stintClubNames.length} stints)${excludedTeams.length ? ` [excluded national team(s): ${excludedTeams.join(', ')}]` : ''}`);
      cache[key] = {
        status: 'kept',
        // Use the original input name (e.g. "Kevin De Bruyne"), not the
        // API's `player.name` field -- that's often abbreviated to
        // "F. Lastname" for well-known players, which looks wrong in the game.
        name,
        id: player.id,
        photo: player.photo,
        career: spells,
      };
      saveCache(cache);
    } catch (err) {
      console.log(`FAILED (${err.message})`);
      failures.push({ name, error: err.message });
      // Don't cache failures -- they're worth retrying on the next run.
    }
  }

  // ---------------------------------------------------------------------
  // Build js/careerPlayers.js from whatever is in the cache right now
  // ---------------------------------------------------------------------
  const tiersOut = {};
  for (const [tierName, names] of Object.entries(NAME_TIERS)) {
    const players = [];
    const seenInTier = new Set();
    for (const name of names) {
      const key = normalize(name);
      if (seenInTier.has(key)) continue; // de-dupe literal repeats within one tier
      seenInTier.add(key);
      const entry = cache[key];
      if (entry && entry.status === 'kept') {
        players.push({ name: entry.name, id: entry.id, photo: entry.photo, career: entry.career });
      }
    }
    tiersOut[tierName] = players;
  }

  writeCareerPlayersFile(tiersOut);

  // ---------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------
  console.log('\n=== Summary ===');
  console.log(`API requests used this run: ${requestCount}`);
  console.log(`Kept: easy=${tiersOut.easy.length}, medium=${tiersOut.medium.length}, hard=${tiersOut.hard.length}`);

  if (dropped.length) {
    console.log(`\nDropped (fewer than ${MIN_CLUBS} senior club stints):`);
    for (const d of dropped) {
      console.log(`  - ${d.name}: ${d.stintCount} stint(s) [${d.clubs.join(', ') || 'none'}]`);
    }
  }
  if (notFound.length) {
    console.log(`\nCould not resolve to a player ID:`);
    for (const n of notFound) console.log(`  - ${n}`);
  }
  if (ambiguousPicks.length) {
    console.log(`\nAmbiguous name matches (best-scoring candidate used -- please double check):`);
    for (const a of ambiguousPicks) {
      console.log(`  - "${a.name}" -> picked "${a.picked}" (id ${a.id})`);
      if (a.candidates) {
        for (const c of a.candidates) console.log(`      candidate: ${c}`);
      }
    }
  }
  if (failures.length) {
    console.log(`\nFailed requests (network/API errors, retry by rerunning the script):`);
    for (const f of failures) console.log(`  - ${f.name}: ${f.error}`);
  }
  if (ranOutOfBudget) {
    console.log(`\nRun this script again to resolve the remaining names once your daily quota resets.`);
  }
  console.log(`\nWrote ${OUTPUT_PATH}`);
}

function writeCareerPlayersFile(tiersOut) {
  const renderPlayer = (p) => {
    const career = p.career
      .map((s) => `      { club: ${JSON.stringify(s.club)}, startYear: ${s.startYear}, endYear: ${s.endYear} },`)
      .join('\n');
    return [
      '  {',
      `    name: ${JSON.stringify(p.name)},`,
      `    id: ${p.id},`,
      `    photo: ${JSON.stringify(p.photo)},`,
      '    career: [',
      career,
      '    ],',
      '  },',
    ].join('\n');
  };

  const renderTier = (players) => players.map(renderPlayer).join('\n');

  const contents = `// Auto-generated by scripts/buildPlayers.js -- do not edit by hand.
// Regenerate by running: node scripts/buildPlayers.js
//
// Data source: api-football.com (https://www.api-football.com/).
// Each player kept here has 4 or more senior club STINTS in their career
// (national teams are excluded from that count). A stint counts every time,
// so a player who left and later rejoined the same club has that return
// trip count separately -- career arrays are ordered chronologically, and
// that player will show up as two separate entries for the same club.
//
// Loaded as a plain script (not an ES module) -- include with:
//   <script src="js/careerPlayers.js"></script>

const careerPlayers = {
  easy: [
${renderTier(tiersOut.easy)}
  ],
  medium: [
${renderTier(tiersOut.medium)}
  ],
  hard: [
${renderTier(tiersOut.hard)}
  ],
};
`;

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, contents);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
