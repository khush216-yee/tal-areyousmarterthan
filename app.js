/* =====================================================
   ARE YOU SMARTER THAN — TAL
   app.js — Game logic, state management, bot behavior
===================================================== */

'use strict';

const $ = id => document.getElementById(id);

// ─── Game State ────────────────────────────────────
const state = {
  screen: 'landing',
  category: null,
  track: null,
  difficulty: null,
  botKey: null,

  gameConfig: null,

  allQuestions: [],
  questions: [],
  currentQ: 0,

  playerScore: 0,
  botScore: 0,
  wrongStreak: 0,

  timerValue: 0,
  timerInterval: null,
  botTimeout: null,
  autoAdvanceTimeout: null,

  botAnswerIndex: -1,
  botCorrect: false,
  botAnswered: false,

  playerAnswered: false,
  playerAnswerIndex: -1,

  tickBubbleShown: false,
};

// ─── Question file map ──────────────────────────────
const QUESTION_FILES = {
  javascript: {
    easy:   'questions/frontend/javascript/java-easy%20v2.json',
    medium: 'questions/frontend/javascript/java-medium%20v2.json',
    hard:   'questions/frontend/javascript/java-hard%20v2.json',
  },
  react: {
    easy:   'questions/frontend/react/react-easy.json',
    medium: 'questions/frontend/react/react-medium.json',
    hard:   'questions/frontend/react/react-hard.json',
  },
  css: {
    easy:   'questions/frontend/css/css-easy.json',
    medium: 'questions/frontend/css/css-medium.json',
    hard:   'questions/frontend/css/css-hard.json',
  },
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
        showScreen('track');
      } else {
        showToast('Questions coming soon');
      }
    });
  });

  // --- Track cards ---
  $('back-from-track').addEventListener('click', () => showScreen('landing'));

  document.querySelectorAll('.track-card').forEach(card => {
    card.addEventListener('click', () => {
      const track = card.dataset.track;
      if (['javascript', 'react', 'css', 'all'].includes(track)) {
        state.track = track;
        showScreen('difficulty');
      } else {
        showToast('Questions coming soon');
      }
    });
  });

  // --- Difficulty ---
  $('back-from-difficulty').addEventListener('click', () => showScreen('track'));

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
//  LOAD QUESTIONS
// ═══════════════════════════════════════════════════
async function loadQuestions() {
  if (state.track === 'all') {
    const tracks = ['javascript', 'react', 'css'];
    const combined = [];
    for (const t of tracks) {
      try {
        const res  = await fetch(QUESTION_FILES[t][state.difficulty]);
        const data = await res.json();
        const qs   = Array.isArray(data) ? data : (data.questions || []);
        combined.push(...qs);
      } catch (e) {
        console.error(`Failed to load ${t} questions`, e);
      }
    }
    return combined;
  }
  const url  = QUESTION_FILES[state.track][state.difficulty];
  const res  = await fetch(url);
  const data = await res.json();
  return Array.isArray(data) ? data : (data.questions || []);
}

// ═══════════════════════════════════════════════════
//  START GAME
// ═══════════════════════════════════════════════════
async function startGame() {
  state.playerScore = 0;
  state.botScore    = 0;
  state.wrongStreak = 0;
  state.currentQ    = 0;
  state.questions   = [];

  try {
    state.allQuestions = await loadQuestions();
  } catch (e) {
    console.error('Failed to load questions', e);
    showToast('Failed to load questions. Please try again.');
    return;
  }

  if (!state.allQuestions.length) {
    showToast('No questions available for this selection.');
    return;
  }

  const pool = [...state.allQuestions].sort(() => Math.random() - 0.5);
  state.questions = pool.slice(0, Math.min(7, pool.length));

  showScreen('game');
  updateScoreDisplay();
  buildProgressDots();
  renderQuestion();
}

// ═══════════════════════════════════════════════════
//  SCORE DISPLAY
// ═══════════════════════════════════════════════════
function updateScoreDisplay() {
  $('player-score-display').textContent = `${state.playerScore} / 7`;
  $('bot-score-display').textContent    = `${state.botScore} / 7`;
}

// ═══════════════════════════════════════════════════
//  PROGRESS DOTS
// ═══════════════════════════════════════════════════
function buildProgressDots() {
  const container = $('progress-dots');
  container.innerHTML = '';
  const total = state.questions.length;
  for (let i = 0; i < total; i++) {
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

  // Reset per-question state
  state.botAnswerIndex  = -1;
  state.botCorrect      = false;
  state.botAnswered     = false;
  state.playerAnswered  = false;
  state.playerAnswerIndex = -1;
  state.tickBubbleShown = false;

  $('q-counter').textContent = `${state.currentQ + 1} / ${state.questions.length}`;
  $('game-timer').classList.remove('urgent');

  setDot(state.currentQ, 'active');

  $('question-text').textContent = q.q;

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

  $('explanation-box').style.display = 'none';
  $('next-btn').style.display = 'none';
  hideSpeechBubble();

  // Pre-calculate bot answer
  const botCfg  = state.gameConfig.bots[state.botKey];
  const accuracy = botCfg.accuracy[state.difficulty];
  state.botCorrect     = Math.random() < accuracy;
  const wrongFallback  = (q.correct + 1) % q.options.length;
  state.botAnswerIndex = state.botCorrect
    ? q.correct
    : (q.wrongPick !== undefined ? q.wrongPick : wrongFallback);

  // Pre-mark when the bot has "decided" — indicator hidden until player acts
  const { min, max } = botCfg.responseTime;
  const delay = (min + Math.random() * (max - min)) * 1000;
  state.botTimeout = setTimeout(() => {
    state.botAnswered = true;
  }, delay);

  // Start countdown timer
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

  state.botAnswered = true;
  showBotIndicator(state.botAnswerIndex);

  revealAnswers(-1);
  setDot(state.currentQ, 'timeout');
  state.wrongStreak++;

  // Always show explanation on timeout
  const q = state.questions[state.currentQ];
  if (q && q.explain) {
    $('explanation-text').textContent = q.explain;
    $('explanation-box').style.display = 'block';
  }

  setTimeout(chooseSpeechBubble, 380);

  // Auto-advance after 2 seconds (no Next button on timeout)
  clearTimeout(state.autoAdvanceTimeout);
  state.autoAdvanceTimeout = setTimeout(advanceQuestion, 2000);
}

// ═══════════════════════════════════════════════════
//  PLAYER ANSWER
// ═══════════════════════════════════════════════════
function onPlayerAnswer(index) {
  if (state.playerAnswered) return;

  clearInterval(state.timerInterval);
  clearTimeout(state.botTimeout);
  clearTimeout(state.autoAdvanceTimeout);
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

  state.botAnswered = true;
  showBotIndicator(state.botAnswerIndex);

  revealAnswers(index);

  if (!isCorrect && q.explain) {
    $('explanation-text').textContent = q.explain;
    $('explanation-box').style.display = 'block';
  }

  updateScoreDisplay();
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
  btn.style.animation = 'none';
  void btn.offsetWidth;
  btn.style.animation = '';
}

// ═══════════════════════════════════════════════════
//  ADVANCE TO NEXT QUESTION
// ═══════════════════════════════════════════════════
function advanceQuestion() {
  clearTimeout(state.autoAdvanceTimeout);

  if (state.botCorrect) state.botScore++;
  updateScoreDisplay();

  state.currentQ++;

  if (state.currentQ >= state.questions.length) {
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
  clearTimeout(state.autoAdvanceTimeout);

  const playerWins = state.playerScore > state.botScore;
  showSpeechBubble(playerWins ? 'I will remember this.' : 'Was this supposed to be hard?');

  setTimeout(() => {
    populateResults();
    showScreen('results');
  }, 1500);
}

// ─── Populate results screen ────────────────────────
function populateResults() {
  $('result-player-score').textContent = `${state.playerScore}/${state.questions.length}`;
  $('result-bot-score').textContent    = `${state.botScore}/${state.questions.length}`;

  const botName = state.gameConfig?.bots[state.botKey]?.name || 'TAL';
  $('result-bot-name').textContent = botName;

  let verdict;
  if (state.playerScore > state.botScore) {
    verdict = 'You beat the AI. Don\'t get used to it.';
  } else if (state.playerScore < state.botScore) {
    verdict = 'The AI wins this round. Try harder.';
  } else {
    verdict = 'A tie. The AI is almost impressed.';
  }
  $('result-verdict').textContent = verdict;
}

// ═══════════════════════════════════════════════════
//  RESET
// ═══════════════════════════════════════════════════
function resetGame() {
  clearInterval(state.timerInterval);
  clearTimeout(state.botTimeout);
  clearTimeout(state.autoAdvanceTimeout);
  Object.assign(state, {
    category: null, track: null, difficulty: null, botKey: null,
    allQuestions: [], questions: [],
    currentQ: 0, playerScore: 0, botScore: 0, wrongStreak: 0,
    timerValue: 0, timerInterval: null, botTimeout: null, autoAdvanceTimeout: null,
    botAnswerIndex: -1, botCorrect: false, botAnswered: false,
    playerAnswered: false, playerAnswerIndex: -1, tickBubbleShown: false,
  });
}

// ═══════════════════════════════════════════════════
//  SPEECH BUBBLE
// ═══════════════════════════════════════════════════
function chooseSpeechBubble() {
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

  bubble.style.display = 'none';
  bubble.style.animation = 'none';
  void bubble.offsetWidth;
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
