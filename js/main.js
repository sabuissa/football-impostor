// main.js
// All the game logic for Football Impostor.
// Data (the list of footballers) lives in data.js — this file just uses it.

import { players } from "./data.js";

// ---------------------------------------------------------------------------
// Grab references to all the HTML elements we'll need to read from / write to.
// ---------------------------------------------------------------------------

const setupScreen = document.getElementById("setup-screen");
const revealScreen = document.getElementById("reveal-screen");
const discussionScreen = document.getElementById("discussion-screen");

const playerCountSelect = document.getElementById("player-count");
const impostorCountSelect = document.getElementById("impostor-count");
const nameInputsContainer = document.getElementById("name-inputs");
const startGameBtn = document.getElementById("start-game-btn");

const passPrompt = document.getElementById("pass-prompt");
const revealRoleBtn = document.getElementById("reveal-role-btn");
const roleDisplay = document.getElementById("role-display");
const roleText = document.getElementById("role-text");
const hideRoleBtn = document.getElementById("hide-role-btn");

const starterText = document.getElementById("starter-text");
const revealImpostorBtn = document.getElementById("reveal-impostor-btn");
const answerDisplay = document.getElementById("answer-display");
const answerText = document.getElementById("answer-text");
const newRoundBtn = document.getElementById("new-round-btn");

// ---------------------------------------------------------------------------
// Game state — everything we need to remember for the current round.
// ---------------------------------------------------------------------------

let playerNames = [];       // e.g. ["Alice", "Bob", "Carol"]
let impostorIndexes = [];   // indexes into playerNames that are impostors
let secretPlayer = "";      // the randomly chosen footballer
let currentTurn = 0;        // whose turn it is to look at the reveal screen

// ---------------------------------------------------------------------------
// Setup screen: build the name input fields whenever the player count changes.
// ---------------------------------------------------------------------------

function buildNameInputs() {
  const count = Number(playerCountSelect.value);

  nameInputsContainer.innerHTML = "";
  for (let i = 1; i <= count; i++) {
    const input = document.createElement("input");
    input.type = "text";
    input.id = `player-name-${i}`;
    input.placeholder = `Player ${i}`;
    input.value = `Player ${i}`;
    nameInputsContainer.appendChild(input);
  }
}

playerCountSelect.addEventListener("change", buildNameInputs);

// Build the initial set of name inputs as soon as the page loads.
buildNameInputs();

// ---------------------------------------------------------------------------
// Small helper functions
// ---------------------------------------------------------------------------

// Returns a random whole number from 0 up to (but not including) max.
function randomIndex(max) {
  return Math.floor(Math.random() * max);
}

// Shuffles an array of indexes (0, 1, 2, ...) and returns the first `count`
// of them. This is how we randomly pick which players are impostors, and
// later, who starts the discussion.
function pickRandomIndexes(totalCount, howMany) {
  const indexes = [];
  for (let i = 0; i < totalCount; i++) {
    indexes.push(i);
  }

  // Simple shuffle: repeatedly swap the current slot with a random one.
  for (let i = indexes.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    const temp = indexes[i];
    indexes[i] = indexes[j];
    indexes[j] = temp;
  }

  return indexes.slice(0, howMany);
}

function showScreen(screenToShow) {
  setupScreen.classList.add("hidden");
  revealScreen.classList.add("hidden");
  discussionScreen.classList.add("hidden");
  screenToShow.classList.remove("hidden");
}

// ---------------------------------------------------------------------------
// Starting a new round: read the setup form, randomize roles, begin reveal.
// ---------------------------------------------------------------------------

startGameBtn.addEventListener("click", () => {
  const playerCount = Number(playerCountSelect.value);
  const impostorCount = Number(impostorCountSelect.value);

  // Read the (possibly customized) player names from the input fields.
  playerNames = [];
  for (let i = 1; i <= playerCount; i++) {
    const input = document.getElementById(`player-name-${i}`);
    const name = input.value.trim() || `Player ${i}`;
    playerNames.push(name);
  }

  // Pick the secret footballer and the impostors for this round.
  secretPlayer = players[randomIndex(players.length)];
  impostorIndexes = pickRandomIndexes(playerCount, impostorCount);

  currentTurn = 0;
  startRevealTurn();
  showScreen(revealScreen);
});

// ---------------------------------------------------------------------------
// Reveal screen: one player at a time taps to see their role, then hides it
// before passing the device to the next player.
// ---------------------------------------------------------------------------

function startRevealTurn() {
  passPrompt.textContent = `${playerNames[currentTurn]}, tap to see your role.`;
  revealRoleBtn.classList.remove("hidden");
  roleDisplay.classList.add("hidden");
}

revealRoleBtn.addEventListener("click", () => {
  const isImpostor = impostorIndexes.includes(currentTurn);
  roleText.textContent = isImpostor
    ? "YOU ARE THE IMPOSTOR."
    : secretPlayer;

  revealRoleBtn.classList.add("hidden");
  roleDisplay.classList.remove("hidden");
});

hideRoleBtn.addEventListener("click", () => {
  currentTurn++;

  if (currentTurn < playerNames.length) {
    // More players still need to see their role.
    startRevealTurn();
  } else {
    // Everyone has seen their role — move on to the discussion screen.
    startDiscussion();
    showScreen(discussionScreen);
  }
});

// ---------------------------------------------------------------------------
// Discussion screen: announce who starts talking, then let players reveal
// the impostor(s) and the secret footballer when they're ready.
// ---------------------------------------------------------------------------

function startDiscussion() {
  const [starterIndex] = pickRandomIndexes(playerNames.length, 1);
  starterText.textContent = `${playerNames[starterIndex]} starts the discussion.`;

  revealImpostorBtn.classList.remove("hidden");
  answerDisplay.classList.add("hidden");
}

revealImpostorBtn.addEventListener("click", () => {
  const impostorNames = impostorIndexes.map((i) => playerNames[i]);
  const impostorLabel = impostorNames.length > 1 ? "Impostors were" : "Impostor was";

  answerText.textContent =
    `${impostorLabel}: ${impostorNames.join(", ")}\n` +
    `The footballer was: ${secretPlayer}`;

  revealImpostorBtn.classList.add("hidden");
  answerDisplay.classList.remove("hidden");
});

// ---------------------------------------------------------------------------
// New round: just go back to the setup screen so players can adjust settings
// (or keep them) and start again.
// ---------------------------------------------------------------------------

newRoundBtn.addEventListener("click", () => {
  showScreen(setupScreen);
});
