/* =====================================================
   ARE YOU SMARTER THAN — TAL
   app.js — Game logic, state management, bot behavior
===================================================== */

'use strict';

// ─── DOM helper ────────────────────────────────────
const $ = id => document.getElementById(id);

// ─── Game State ────────────────────────────────────
const state = {
  // Navigation
  screen: 'landing',
  category: null,
  difficulty: null,
  botKey: null,

  // Config (loaded from game.json)
  gameConfig: null,

  // Questions
  allQuestions: [],
  questions: [],      // 7 selected for this match
  currentQ: 0,        // index 0–6

  // Scores
  playerScore: 0,
  botScore: 0,
  wrongStreak: 0,     // consecutive wrong / timeout answers by player

  // Per-question volatile state
  timerValue: 0,
  timerInterval: null,
  botTimeout: null,

  botAnswerIndex: -1,
  botCorrect: false,
  botAnswered: false,

  playerAnswered: false,
  playerAnswerIndex: -1,

  tickBubbleShown: false,  // so we only trigger "Tick" bubble once per question
};

// ─── Question file map ──────────────────────────────
// Actual filenames on disk (spaces encoded for fetch)
const QUESTION_FILES = {
  easy:   'questions/frontend/javascript/java-easy%20v2.json',
  medium: 'questions/frontend/javascript/java-medium%20v2.json',
  hard:   'questions/frontend/javascript/java-hard%20v2.json',
};

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

// ═══════════════════════════════════════════════════
//  INITIALISATION
// ═══════════════════════════════════════════════════
async function init() {
  try {
    const res = await fetch('config/game.json');
    state.gameConfig = await res.json();
  } catch (e) {
    console.error('Could not load game.json', e);
  }
  bindEvents();
}

// ═══════════════════════════════════════════════════
//  EVENT BINDING
// ═══════════════════════════════════════════════════
function bindEvents() {

  // --- Category cards ---
  document.querySelectorAll('.category-card').forEach(card => {
    card.addEventListener('click', () => {
      const cat = card.dataset.category;
      if (cat === 'frontend') {
        state.category = cat;
        showScreen('difficulty');
      } else {
        showToast('Questions coming soon');
      }
    });
  });

  // --- Difficulty ---
  $('back-from-difficulty').addEventListener('click', () => showScreen('landing'));

  document.querySelectorAll('.difficulty-card').forEach(card => {
    card.addEventListener('click', () => {
      state.difficulty = card.dataset.difficulty;
      showScreen('opponent');
    });
  });

  // --- Opponent ---
  $('back-from-opponent').addEventListener('click', () => showScreen('difficulty'));

  document.querySelectorAll('.bot-card').forEach(card => {
    card.addEventListener('click', () => {
      state.botKey = card.dataset.bot;
      startGame();
    });
  });

  // --- In-game ---
  $('next-btn').addEventListener('click', advanceQuestion);
  $('play-again-btn').addEventListener('click', () => {
    resetGame();
    showScreen('landing');
  });
}

// ═══════════════════════════════════════════════════
//  SCREEN MANAGEMENT
// ═══════════════════════════════════════════════════
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = $(`screen-${name}`);
  if (el) {
    // Restart animation
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    el.classList.add('active');
  }
  state.screen = name;
}

// ═══════════════════════════════════════════════════
//  TOAST
// ═══════════════════════════════════════════════════
let _toastTimer = null;
function showToast(msg) {
  const toast = $('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

// ═══════════════════════════════════════════════════
//  START GAME
// ═══════════════════════════════════════════════════
async function startGame() {
  // Reset scores
  state.playerScore = 0;
  state.botScore    = 0;
  state.wrongStreak = 0;
  state.currentQ    = 0;
  state.questions   = [];

  try {
    const res  = await fetch(QUESTION_FILES[state.difficulty]);
    const data = await res.json();
    state.allQuestions = Array.isArray(data) ? data : (data.questions || []);
  } catch (e) {
    console.error('Failed to load questions', e);
    showToast('Failed to load questions. Please try again.');
    return;
  }

  // Pick 7 random questions
  const pool = [...state.allQuestions].sort(() => Math.random() - 0.5);
  state.questions = pool.slice(0, 7);

  showScreen('game');
  buildProgressDots();
  renderQuestion();
}

// ═══════════════════════════════════════════════════
//  PROGRESS DOTS
// ═══════════════════════════════════════════════════
function buildProgressDots() {
  const container = $('progress-dots');
  container.innerHTML = '';
  for (let i = 0; i < 7; i++) {
    const dot = document.createElement('div');
    dot.className = 'dot' + (i === 0 ? ' active' : '');
    dot.id = `dot-${i}`;
    container.appendChild(dot);
  }
}

function setDot(index, status) {
  const dot = $(`dot-${index}`);
  if (dot) dot.className = `dot ${status}`;
}

// ═══════════════════════════════════════════════════
//  RENDER QUESTION
// ═══════════════════════════════════════════════════
function renderQuestion() {
  const q = state.questions[state.currentQ];
  if (!q) return;

  // ── Reset per-question state ──
  state.botAnswerIndex  = -1;
  state.botCorrect      = false;
  state.botAnswered     = false;
  state.playerAnswered  = false;
  state.playerAnswerIndex = -1;
  state.tickBubbleShown = false;

  // ── Header ──
  $('q-counter').textContent = `${state.currentQ + 1} / 7`;
  $('game-timer').classList.remove('urgent');

  // ── Active dot ──
  setDot(state.currentQ, 'active');

  // ── Question text ──
  $('question-text').textContent = q.q;

  // ── Options ──
  const list = $('options-list');
  list.innerHTML = '';
  q.options.forEach((opt, i) => {
    const card = document.createElement('div');
    card.className = 'option-card';
    card.dataset.index = i;
    card.innerHTML = `
      <span class="option-label">${OPTION_LABELS[i]}</span>
      <span class="option-text">${opt}</span>
    `;
    card.addEventListener('click', () => onPlayerAnswer(i));
    list.appendChild(card);
  });

  // ── Hide explanation and next ──
  $('explanation-box').style.display = 'none';
  $('next-btn').style.display = 'none';

  // ── Hide speech bubble ──
  hideSpeechBubble();

  // ── Pre-calculate bot answer ──
  const botCfg  = state.gameConfig.bots[state.botKey];
  const accuracy = botCfg.accuracy[state.difficulty];
  state.botCorrect     = Math.random() < accuracy;
  state.botAnswerIndex = state.botCorrect ? q.correct : q.wrongPick;

  // ── Schedule bot's visible response ──
  const { min, max } = botCfg.responseTime;
  const delay = (min + Math.random() * (max - min)) * 1000;
  state.botTimeout = setTimeout(() => {
    if (!state.playerAnswered) {        // only show indicator if still unanswered
      state.botAnswered = true;
      showBotIndicator(state.botAnswerIndex);
    }
  }, delay);

  // ── Start countdown timer ──
  const timerMap = { easy: 30, medium: 40, hard: 45 };
  state.timerValue = timerMap[state.difficulty];
  renderTimer();

  clearInterval(state.timerInterval);
  state.timerInterval = setInterval(tickTimer, 1000);
}

// ═══════════════════════════════════════════════════
//  TIMER
// ═══════════════════════════════════════════════════
function renderTimer() {
  const s    = state.timerValue;
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  $('game-timer').textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
}

function tickTimer() {
  state.timerValue--;
  renderTimer();

  // Urgent styling + "Tick" bubble when ≤ 10 s
  if (state.timerValue <= 10 && !state.playerAnswered) {
    $('game-timer').classList.add('urgent');
    if (!state.tickBubbleShown) {
      state.tickBubbleShown = true;
      showSpeechBubble('Tick. Tick. Tick.');
    }
  }

  if (state.timerValue <= 0) {
    clearInterval(state.timerInterval);
    onTimeOut();
  }
}

// ─── Timer ran out ──────────────────────────────────
function onTimeOut() {
  clearTimeout(state.botTimeout);
  state.playerAnswered = true;

  // Show bot answer immediately if not yet shown
  if (!state.botAnswered) {
    state.botAnswered = true;
    showBotIndicator(state.botAnswerIndex);
  }

  revealAnswers(-1);            // -1 = no player selection
  setDot(state.currentQ, 'timeout');

  state.wrongStreak++;          // time-out counts as wrong

  // Show next button
  showNext();

  // Speech bubble (after short delay for polish)
  setTimeout(chooseSpeechBubble, 380);
}

// ═══════════════════════════════════════════════════
//  PLAYER ANSWER
// ═══════════════════════════════════════════════════
function onPlayerAnswer(index) {
  if (state.playerAnswered) return;

  clearInterval(state.timerInterval);
  clearTimeout(state.botTimeout);
  $('game-timer').classList.remove('urgent');

  state.playerAnswered    = true;
  state.playerAnswerIndex = index;

  const q         = state.questions[state.currentQ];
  const isCorrect = index === q.correct;

  if (isCorrect) {
    state.playerScore++;
    state.wrongStreak = 0;
    setDot(state.currentQ, 'correct');
  } else {
    state.wrongStreak++;
    setDot(state.currentQ, 'wrong');
  }

  // Show bot indicator immediately if bot hadn't responded yet
  if (!state.botAnswered) {
    state.botAnswered = true;
    showBotIndicator(state.botAnswerIndex);
  }

  revealAnswers(index);

  // Explanation only on wrong answer
  if (!isCorrect && q.explain) {
    $('explanation-text').textContent = q.explain;
    $('explanation-box').style.display = 'block';
  }

  showNext();
  setTimeout(chooseSpeechBubble, 380);
}

// ═══════════════════════════════════════════════════
//  REVEAL ANSWERS
// ═══════════════════════════════════════════════════
function revealAnswers(playerIndex) {
  const q = state.questions[state.currentQ];
  document.querySelectorAll('.option-card').forEach(card => {
    card.classList.add('answered');
    const i = parseInt(card.dataset.index, 10);
    if (i === q.correct) {
      card.classList.add('correct');
    } else if (i === playerIndex) {
      card.classList.add('wrong');
    }
  });
}

// ═══════════════════════════════════════════════════
//  BOT INDICATOR
// ═══════════════════════════════════════════════════
function showBotIndicator(answerIndex) {
  document.querySelectorAll('.option-card').forEach(card => {
    if (parseInt(card.dataset.index, 10) === answerIndex) {
      if (!card.querySelector('.bot-indicator')) {
        const el = document.createElement('div');
        el.className = 'bot-indicator';
        el.title     = 'Bot\'s answer';
        el.textContent = '🤖';
        card.appendChild(el);
      }
    }
  });
}

// ═══════════════════════════════════════════════════
//  NEXT BUTTON
// ═══════════════════════════════════════════════════
function showNext() {
  const btn = $('next-btn');
  btn.style.display = 'block';
  // Reset animation
  btn.style.animation = 'none';
  void btn.offsetWidth;
  btn.style.animation = '';
}

// ═══════════════════════════════════════════════════
//  ADVANCE TO NEXT QUESTION
// ═══════════════════════════════════════════════════
function advanceQuestion() {
  // Track bot score before moving on
  if (state.botCorrect) state.botScore++;

  state.currentQ++;

  if (state.currentQ >= 7) {
    endGame();
  } else {
    renderQuestion();
  }
}

// ═══════════════════════════════════════════════════
//  END GAME
// ═══════════════════════════════════════════════════
function endGame() {
  clearInterval(state.timerInterval);
  clearTimeout(state.botTimeout);
  showScreen('results');
}

// ═══════════════════════════════════════════════════
//  RESET
// ═══════════════════════════════════════════════════
function resetGame() {
  clearInterval(state.timerInterval);
  clearTimeout(state.botTimeout);
  Object.assign(state, {
    category: null, difficulty: null, botKey: null,
    allQuestions: [], questions: [],
    currentQ: 0, playerScore: 0, botScore: 0, wrongStreak: 0,
    timerValue: 0, timerInterval: null, botTimeout: null,
    botAnswerIndex: -1, botCorrect: false, botAnswered: false,
    playerAnswered: false, playerAnswerIndex: -1, tickBubbleShown: false,
  });
}

// ═══════════════════════════════════════════════════
//  SPEECH BUBBLE
// ═══════════════════════════════════════════════════
function chooseSpeechBubble() {
  // Priority: wrong streak ≥ 2 → streak message
  //           else: react to bot's result
  if (state.wrongStreak >= 2) {
    showSpeechBubble('As expected.');
  } else if (state.botCorrect) {
    showSpeechBubble('Obviously.');
  } else {
    showSpeechBubble('Hm. Noted.');
  }
}

function showSpeechBubble(text) {
  const bubble = $('speech-bubble');
  const textEl = $('speech-text');

  textEl.textContent = text;

  // Reset CSS animation by toggling display
  bubble.style.display = 'none';
  bubble.style.animation = 'none';
  void bubble.offsetWidth;           // force reflow
  bubble.style.animation = '';
  bubble.style.display = 'block';
}

function hideSpeechBubble() {
  $('speech-bubble').style.display = 'none';
}

// ═══════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════
init();
