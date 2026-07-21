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
//    game's ~200 names), imported read-only below. This is ONLY used to
//    populate the search-as-you-type dropdown. If the dropdown searched the
//    answer pool instead, it would double as an answer key -- typing any
//    letter would instantly show you the small list of possible answers.
//    Searching a much bigger, unrelated name list keeps the dropdown useful
//    without giving the game away. We never modify data.js -- just import
//    its exported list, same as main.js already does for the impostor game.
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
const playerPhoto = document.getElementById("player-photo");
const careerList = document.getElementById("career-list");
const guessInput = document.getElementById("guess-input");
const guessDropdown = document.getElementById("guess-dropdown");
const guessesLeftText = document.getElementById("guesses-left");
const feedbackMessage = document.getElementById("feedback-message");
const answerBox = document.getElementById("answer-box");
const answerName = document.getElementById("answer-name");
const giveUpBtn = document.getElementById("give-up-btn");
const newRoundBtn = document.getElementById("new-round-btn");

const MAX_GUESSES = 5;
const STARTING_CLUB_COUNT = 2; // how many clubs are revealed right at the start

// ---------------------------------------------------------------------------
// Game state -- everything we need to remember for the current round.
// ---------------------------------------------------------------------------

let currentTierName = "easy";
let currentTierPlayers = []; // the array of players for the chosen difficulty
let currentPlayer = null; // the randomly chosen mystery player
let guessesUsed = 0;
let revealedClubCount = STARTING_CLUB_COUNT;
let roundOver = false; // true once the round has been won, lost, or given up

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
  currentPlayer = currentTierPlayers[randomIndex(currentTierPlayers.length)];
  guessesUsed = 0;
  revealedClubCount = Math.min(STARTING_CLUB_COUNT, currentPlayer.career.length);
  roundOver = false;

  difficultyLabel.textContent =
    "Difficulty: " + currentTierName[0].toUpperCase() + currentTierName.slice(1);

  // Show the (blurred) photo for the new player. If the image URL is broken,
  // the onerror handler hides it completely instead of showing a broken icon.
  playerPhoto.classList.remove("hidden");
  playerPhoto.classList.add("blurred");
  playerPhoto.onerror = () => playerPhoto.classList.add("hidden");
  playerPhoto.src = currentPlayer.photo;

  guessInput.value = "";
  guessInput.disabled = false;
  hideDropdown();
  feedbackMessage.textContent = "";
  answerBox.classList.add("hidden");
  giveUpBtn.classList.remove("hidden");

  updateCareerList();
  updateGuessesLeftText();
}

newRoundBtn.addEventListener("click", startNewRound);

// ---------------------------------------------------------------------------
// Progressive career reveal: only show the first `revealedClubCount` clubs.
// ---------------------------------------------------------------------------

function updateCareerList() {
  careerList.innerHTML = "";

  const clubsToShow = currentPlayer.career.slice(0, revealedClubCount);
  for (const stint of clubsToShow) {
    const item = document.createElement("li");
    item.textContent = `${stint.club} (${stint.startYear}–${stint.endYear})`;
    careerList.appendChild(item);
  }
}

function updateGuessesLeftText() {
  guessesLeftText.textContent = `Guesses left: ${MAX_GUESSES - guessesUsed}`;
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
  const matchingNames = allFootballerNames
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
  updateGuessesLeftText();

  guessInput.value = "";

  if (guessesUsed >= MAX_GUESSES) {
    feedbackMessage.textContent = `Out of guesses! It was ${currentPlayer.name}.`;
    endRound();
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
