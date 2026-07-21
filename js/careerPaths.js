// careerPaths.js
// Game logic for the "Career Paths" guessing game.
//
// Player data (the list of footballers + their career paths) lives in
// careerPlayers.js, which is loaded as a plain <script> tag BEFORE this file
// in career-paths.html. That means the global `careerPlayers` variable it
// declares is already available here -- we don't need to import anything.

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
// Search-as-you-type dropdown: shows matching player names as the user types.
// ---------------------------------------------------------------------------

guessInput.addEventListener("input", () => {
  const query = guessInput.value.trim();

  if (roundOver || query === "") {
    hideDropdown();
    return;
  }

  const normalizedQuery = normalize(query);
  const matchingNames = currentTierPlayers
    .map((player) => player.name)
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

// Pressing Enter submits the guess too, as long as the typed text exactly
// matches one of the real player names in the current tier.
guessInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || roundOver) return;

  const typed = normalize(guessInput.value.trim());
  const match = currentTierPlayers.find((player) => normalize(player.name) === typed);
  if (match) {
    hideDropdown();
    submitGuess(match.name);
  }
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
