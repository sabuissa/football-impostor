# PROPOSAL — Football Impostor

## Who it's for
Football fans — mainly my friends — who want a quick, fun party game they
can play together on one device or by sharing a link.

## The one job
Let a group play "impostor" with footballers: everyone sees the same player
except one impostor, who has to blend in without knowing who it is.

## How it works
- **Pass-and-play (v1 core):** one device is passed around. Each player taps
  to privately see their role — everyone gets the same footballer's name
  except one person, who is told they're the impostor.
- **Link-with-a-code (v1 stretch):** a game link contains a code (e.g.
  `?game=abc123`) so a group opening the same link gets the same setup,
  without needing a live server. This keeps it fully static (GitHub Pages
  friendly) while still being shareable.
- After roles are seen, players discuss/describe the player out loud and vote
  on who the impostor is (voting done verbally or on paper for v1).

## AI hint feature (exploratory)
When a player is generated, the game can optionally request a **one-word hint**
from an AI API — a vague clue about the player (e.g. their position or
nationality) that the impostor can use to blend in. This reuses the AI-call
pattern from the ai-chat class exercise. Marked as a stretch feature, not core.

## Data
Footballer data will come from a free public football API (to be selected).
Following class practice, I will open the API's raw JSON in the browser and
read the real field names before writing any fetch code, rather than assuming
the structure.

## Stretch: additional game modes
If time allows, add more football mini-games as separate modes on the same site:
- **Career Path** — show a player's club history as a trail; guess the player.
- **Who Am I?** — reveal clues one at a time; guess in as few as possible.
These are secondary; the impostor game is the priority.

## Tech
- Static site: HTML, CSS, JavaScript, hosted on GitHub Pages.
- Core JS patterns from the course: arrays + loops to handle player data,
  reading the URL for the game code, fetch for the football API, and the
  AI-call pattern for hints.
- No backend / no live multiplayer in this version — deliberately scoped to
  what runs client-side, using pass-and-play and shareable codes instead.

## What success looks like
- A working impostor game playable pass-and-play with a group.
- Same player shown to everyone except one impostor.
- Clean, simple, phone-friendly interface.
- Bonus if the link-with-a-code sharing and the AI hint both work.