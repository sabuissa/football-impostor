# ⚽ Football Impostor

Two football party games for a group sharing one phone. Built as a static site
with plain HTML, CSS, and JavaScript — no backend, no frameworks.

**Live site:** https://sabuissa.github.io/football-impostor/

## What it does

**Football Impostor** — a pass-and-play social deduction game for 3–8 players.
One footballer is chosen at random. Everyone sees that footballer's name except
the 1–3 randomly assigned impostors, who are only told they're the impostor.
Players take turns describing the footballer without naming him; the impostors
have to bluff along. Then everyone votes.

**Career Paths** — a guessing game. You're shown a hidden footballer's club
history one club at a time, and you have five guesses to name him. Type into the
search box to pick from real player names. Wrong guesses reveal another club.
The player's photo starts blurred and un-blurs when the answer is revealed.
Three difficulty tiers.

## How to use it

Open the live site above on a phone or laptop.

**Football Impostor**
1. Choose the number of players (3–8) and impostors (1–3).
2. Tap a name to edit it.
3. Pass the device around — each player taps to see their role privately, then
   hides it before passing on.
4. A random player is chosen to start the discussion.
5. Tap "Reveal impostors" when the group has voted, then "New round" to play again.

**Career Paths**
1. Pick a difficulty.
2. Read the clubs revealed so far and type a player name — matching names appear
   as you type.
3. Each wrong guess reveals another club. Five guesses, or hit "Give up."
4. "New round" for a new player.

## How it works

Two HTML pages sharing one stylesheet, each with its own JavaScript logic file
and its own data file:

- `index.html` + `js/main.js` + `js/data.js` — the impostor game and its
  footballer list, loaded as ES modules.
- `career-paths.html` + `js/careerPaths.js` + `js/careerPlayers.js` — the career
  guessing game and its player data.
- `scripts/buildPlayers.js` — a one-off Node script that calls the api-football
  API, resolves player names to IDs, filters out youth and reserve squads, drops
  anyone with fewer than four senior clubs, and writes `js/careerPlayers.js`.

The deployed site makes **no API calls**. Career data is fetched at build time by
the script above and saved as a static file, so there's no API key in client-side
code and nothing to fail or hit a rate limit while you're playing.

## Running locally

The impostor game uses ES modules, so opening `index.html` directly from the file
system won't work — browsers block module loading over `file://`. Serve the folder
over HTTP instead: T

hen open `http://localhost:8000`.

To regenerate the career data you'll need an api-football key in a local `.env`
file (git-ignored), then run `node scripts/buildPlayers.js`.