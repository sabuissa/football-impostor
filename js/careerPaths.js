// careerPaths.js
// Game logic for the "Career Paths" guessing game.
//
// This file deliberately reads from TWO separate, unrelated lists:
//
// 1. The ANSWER pool: careerPlayers.js (global `careerPlayers` variable,
//    loaded as a plain <script> tag before this file). The mystery player
//    for each round is ALWAYS chosen from here -- these are the ~11
//    footballers with 4+ verified senior clubs.
//
// 2. The SEARCH pool: js/data.js's `players` list (the football-impostor
//    game's ~200 names), imported read-only below, PLUS every name from
//    every tier of careerPlayers (easy+medium+hard combined, not just the
//    tier currently being played). This is ONLY used to populate the
//    search-as-you-type dropdown. If the dropdown searched just the current
//    tier's answer pool, it would double as an answer key -- typing any
//    letter would instantly show you the small list of possible answers.
//    Searching a much bigger, unrelated name list keeps the dropdown useful
//    without giving the game away. We still mix in every careerPlayers name
//    (from all tiers) so the actual mystery player is always findable, even
//    if data.js happens not to include them (e.g. "Álvaro Morata" isn't in
//    data.js's list at all). We never modify data.js -- just import its
//    exported list, same as main.js already does for the impostor game.
import { players as allFootballerNames } from "./data.js";

// ---------------------------------------------------------------------------
// Grab references to all the HTML elements we'll need to read from / write to.
// ---------------------------------------------------------------------------

const startScreen = document.getElementById("start-screen");
const gameScreen = document.getElementById("game-screen");

const difficultySelect = document.getElementById("difficulty-select");
const startRoundBtn = document.getElementById("start-round-btn");
const startMessage = document.getElementById("start-message");

const difficultyLabel = document.getElementById("difficulty-label");
const cycleMessage = document.getElementById("cycle-message");
const playerPhoto = document.getElementById("player-photo");
const showPhotoToggle = document.getElementById("show-photo-toggle");
const careerList = document.getElementById("career-list");
const guessInput = document.getElementById("guess-input");
const guessDropdown = document.getElementById("guess-dropdown");
const feedbackMessage = document.getElementById("feedback-message");
const answerBox = document.getElementById("answer-box");
const answerName = document.getElementById("answer-name");
const giveUpBtn = document.getElementById("give-up-btn");
const newRoundBtn = document.getElementById("new-round-btn");
const changeDifficultyBtn = document.getElementById("change-difficulty-btn");

const STARTING_CLUB_COUNT = 1; // how many clubs are revealed right at the start
const SEEN_PLAYERS_STORAGE_KEY = "careerPathsSeenPlayerIds";

// The full search pool: data.js's big decoy list, plus every player name
// from every difficulty tier (not just the one being played). Built once,
// since neither list changes while the page is open.
const allAnswerPoolNames = [
  ...(careerPlayers.easy || []),
  ...(careerPlayers.medium || []),
  ...(careerPlayers.hard || []),
].map((player) => player.name);

const searchPoolNames = [...new Set([...allFootballerNames, ...allAnswerPoolNames])];

// ---------------------------------------------------------------------------
// Game state -- everything we need to remember for the current round.
// ---------------------------------------------------------------------------

let currentTierName = "easy";
let currentTierPlayers = []; // the array of players for the chosen difficulty
let currentPlayer = null; // the randomly chosen mystery player
let guessesUsed = 0;
let maxGuesses = 0; // set per round: number of clubs in the career + 1
let revealedClubCount = STARTING_CLUB_COUNT;
let roundOver = false; // true once the round has been won, lost, or given up

let photoVisible = showPhotoToggle.checked; // the "Show photo" toggle preference
let photoLoadFailed = false; // true if THIS round's photo URL failed to load

// Whether the photo is actually shown depends on two independent things:
// the user's toggle preference, and whether the image URL even worked.
function applyPhotoVisibility() {
  if (photoVisible && !photoLoadFailed) {
    playerPhoto.classList.remove("hidden");
  } else {
    playerPhoto.classList.add("hidden");
  }
}

showPhotoToggle.addEventListener("change", () => {
  photoVisible = showPhotoToggle.checked;
  applyPhotoVisibility();
});

// ---------------------------------------------------------------------------
// Small helper functions
// ---------------------------------------------------------------------------

// Strips accents (so "Álvaro" becomes "Alvaro") and lowercases the text, so
// name matching is fully accent- and case-insensitive.
function normalize(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function randomIndex(max) {
  return Math.floor(Math.random() * max);
}

function showScreen(screenToShow) {
  startScreen.classList.add("hidden");
  gameScreen.classList.add("hidden");
  screenToShow.classList.remove("hidden");
}

// ---------------------------------------------------------------------------
// "Don't repeat players on this device" -- remembered in localStorage as
// { easy: [id, id, ...], medium: [...], hard: [...] }, so a refresh or a
// later visit still knows who you've already seen per difficulty.
// ---------------------------------------------------------------------------

function loadSeenPlayerIds() {
  try {
    const raw = localStorage.getItem(SEEN_PLAYERS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    // localStorage can be unavailable (e.g. private browsing) -- just play
    // without memory instead of crashing.
    return {};
  }
}

function saveSeenPlayerIds(seenPlayerIds) {
  try {
    localStorage.setItem(SEEN_PLAYERS_STORAGE_KEY, JSON.stringify(seenPlayerIds));
  } catch {
    // Ignore -- worst case, repeats aren't remembered this session.
  }
}

// Picks the next mystery player for `tierName`, avoiding anyone already seen
// on this device until every player in that tier has come up at least once.
// Returns { player, justCompletedCycle } so the caller can show a message
// when the "everyone's been seen" reset happens.
function pickNextPlayer(tierName, tierPlayers) {
  const seenPlayerIds = loadSeenPlayerIds();
  let seenIdsForTier = seenPlayerIds[tierName] || [];

  let unseenPlayers = tierPlayers.filter((player) => !seenIdsForTier.includes(player.id));
  let justCompletedCycle = false;

  if (unseenPlayers.length === 0) {
    // Everyone in this tier has been shown before -- start a fresh cycle.
    // (Only worth announcing if there was more than one player to cycle
    // through in the first place.)
    justCompletedCycle = seenIdsForTier.length > 0 && tierPlayers.length > 1;
    unseenPlayers = tierPlayers;
    seenIdsForTier = [];
  }

  const player = unseenPlayers[randomIndex(unseenPlayers.length)];
  seenPlayerIds[tierName] = [...seenIdsForTier, player.id];
  saveSeenPlayerIds(seenPlayerIds);

  return { player, justCompletedCycle };
}

// ---------------------------------------------------------------------------
// Start screen: pick a difficulty and start a round.
// ---------------------------------------------------------------------------

startRoundBtn.addEventListener("click", () => {
  currentTierName = difficultySelect.value;
  currentTierPlayers = careerPlayers[currentTierName] || [];

  // CRITICAL: some tiers may still be empty (medium/hard aren't filled in
  // yet). Never let that crash the game or show a blank screen -- just tell
  // the player and let them pick again.
  if (currentTierPlayers.length === 0) {
    startMessage.textContent = "This mode isn't ready yet — try Easy!";
    return;
  }

  startMessage.textContent = "";
  startNewRound();
  showScreen(gameScreen);
});

// ---------------------------------------------------------------------------
// Starting (or restarting) a round: pick a random player and reset everything.
// ---------------------------------------------------------------------------

function startNewRound() {
  const { player, justCompletedCycle } = pickNextPlayer(currentTierName, currentTierPlayers);
  currentPlayer = player;
  guessesUsed = 0;
  maxGuesses = currentPlayer.career.length + 1; // scales with how many clubs there are to reveal
  revealedClubCount = Math.min(STARTING_CLUB_COUNT, currentPlayer.career.length);
  roundOver = false;

  difficultyLabel.textContent =
    "Difficulty: " + currentTierName[0].toUpperCase() + currentTierName.slice(1);

  cycleMessage.textContent = justCompletedCycle
    ? `You've seen every player in this difficulty — starting over, repeats may happen now!`
    : "";

  // Show the (blurred) photo for the new player -- unless the "Show photo"
  // toggle is off, or the image URL turns out to be broken (the onerror
  // handler hides it completely instead of showing an ugly broken icon).
  photoLoadFailed = false;
  playerPhoto.classList.add("blurred");
  playerPhoto.onerror = () => {
    photoLoadFailed = true;
    applyPhotoVisibility();
  };
  playerPhoto.src = currentPlayer.photo;
  applyPhotoVisibility();

  guessInput.value = "";
  guessInput.disabled = false;
  hideDropdown();
  feedbackMessage.textContent = "";
  answerBox.classList.add("hidden");
  giveUpBtn.classList.remove("hidden");

  updateCareerList();
}

newRoundBtn.addEventListener("click", startNewRound);

// "Change difficulty" abandons the current round (if any) and goes back to
// the start screen so a different difficulty can be picked.
changeDifficultyBtn.addEventListener("click", () => {
  showScreen(startScreen);
});

// ---------------------------------------------------------------------------
// Progressive career reveal: only show the first `revealedClubCount` clubs.
// ---------------------------------------------------------------------------

function updateCareerList() {
  careerList.innerHTML = "";

  const clubsToShow = currentPlayer.career.slice(0, revealedClubCount);
  for (const stint of clubsToShow) {
    // A single-year stint (e.g. a short loan spell) shows just "2024"
    // instead of the redundant "2024–2024".
    const years =
      stint.startYear === stint.endYear
        ? `${stint.startYear}`
        : `${stint.startYear}–${stint.endYear}`;

    const item = document.createElement("li");
    item.textContent = `${stint.club} (${years})`;
    careerList.appendChild(item);
  }
}

// ---------------------------------------------------------------------------
// Search-as-you-type dropdown: shows matching names from the LARGE search
// pool (js/data.js), not the small answer pool -- see the note at the top
// of this file for why that separation matters.
// ---------------------------------------------------------------------------

guessInput.addEventListener("input", () => {
  const query = guessInput.value.trim();

  if (roundOver || query === "") {
    hideDropdown();
    return;
  }

  const normalizedQuery = normalize(query);
  const matchingNames = searchPoolNames
    .filter((name) => normalize(name).includes(normalizedQuery))
    .slice(0, 6); // keep the list short so it doesn't take over the screen

  renderDropdown(matchingNames);
});

function renderDropdown(matchingNames) {
  guessDropdown.innerHTML = "";

  if (matchingNames.length === 0) {
    hideDropdown();
    return;
  }

  for (const name of matchingNames) {
    const item = document.createElement("div");
    item.className = "dropdown-item";
    item.textContent = name;
    // Clicking a suggestion immediately submits it as the guess.
    item.addEventListener("click", () => {
      guessInput.value = name;
      hideDropdown();
      submitGuess(name);
    });
    guessDropdown.appendChild(item);
  }

  guessDropdown.classList.remove("hidden");
}

function hideDropdown() {
  guessDropdown.innerHTML = "";
  guessDropdown.classList.add("hidden");
}

// Pressing Enter submits whatever's typed as a guess. We don't require it to
// match something in the search pool first -- submitGuess() below checks it
// against the real answer directly, so this works no matter which pool (or
// neither) the typed text came from.
guessInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || roundOver) return;

  const typed = guessInput.value.trim();
  if (typed === "") return;

  hideDropdown();
  submitGuess(typed);
});

// ---------------------------------------------------------------------------
// Checking a guess.
// ---------------------------------------------------------------------------

function submitGuess(guessedName) {
  if (roundOver) return;

  const isCorrect = normalize(guessedName) === normalize(currentPlayer.name);

  if (isCorrect) {
    feedbackMessage.textContent = "Correct! \u{1F389}";
    endRound();
    return;
  }

  // Wrong guess: it counts against the limit, and reveals one more club.
  guessesUsed++;
  revealedClubCount = Math.min(revealedClubCount + 1, currentPlayer.career.length);
  updateCareerList();

  guessInput.value = "";

  const isFullyRevealed = revealedClubCount >= currentPlayer.career.length;
  const isLastGuessRemaining = guessesUsed === maxGuesses - 1;

  if (guessesUsed >= maxGuesses) {
    feedbackMessage.textContent = `Out of guesses! It was ${currentPlayer.name}.`;
    endRound();
  } else if (isFullyRevealed && isLastGuessRemaining) {
    // The whole career is visible and this was their second-to-last guess --
    // warn them the next one is do-or-die.
    feedbackMessage.textContent = "Final guess!";
  } else {
    feedbackMessage.textContent = `Wrong guess: ${guessedName}`;
  }
}

giveUpBtn.addEventListener("click", () => {
  if (roundOver) return;
  feedbackMessage.textContent = `Gave up. It was ${currentPlayer.name}.`;
  endRound();
});

// ---------------------------------------------------------------------------
// Ending a round (win, loss, or give up): reveal the photo, name, and the
// player's FULL career path.
// ---------------------------------------------------------------------------

function endRound() {
  roundOver = true;
  guessInput.disabled = true;
  hideDropdown();
  giveUpBtn.classList.add("hidden");

  playerPhoto.classList.remove("blurred");

  revealedClubCount = currentPlayer.career.length;
  updateCareerList();

  answerName.textContent = currentPlayer.name;
  answerBox.classList.remove("hidden");
}
