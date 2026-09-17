import { EventEmitter } from 'events';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Lowercase, strip punctuation, collapse whitespace - for forgiving guesses. */
function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Classic edit-distance, used to forgive small typos on longer answers. */
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

/** Is `guess` close enough to `answer` to count as correct? */
function isCorrectGuess(guess, answer) {
  const g = normalize(guess);
  const a = normalize(answer);
  if (!g) return false;
  if (g === a) return true;
  // Allow a 1-character typo on answers of reasonable length only,
  // so short answers still require an exact match.
  if (a.length >= 6) {
    return levenshtein(g, a) <= 1;
  }
  return false;
}

/** Build the "_ _ _ ' _ _" style blank pattern for the board. */
function buildBlanks(answer, revealedIndices) {
  return answer
    .split('')
    .map((ch, i) => {
      if (ch === ' ') return ' ';
      if (!/[a-zA-Z0-9]/.test(ch)) return ch; // show punctuation as-is
      return revealedIndices.has(i) ? answer[i] : '_';
    })
    .join(' ');
}

const STATUS = {
  IDLE: 'idle',
  COUNTDOWN: 'countdown',
  ACTIVE: 'active',
  REVEAL: 'reveal',
};

const ROUND_GAP_MS = 4500; // pause between rounds so the reveal is readable
const TICK_MS = 250;

export class GameEngine extends EventEmitter {
  constructor(wordBank) {
    super();
    this.wordBank = Array.isArray(wordBank) && wordBank.length ? wordBank : [
      { answer: 'HELLO WORLD', emojis: ['👋', '🌍'], category: 'Default', difficulty: 1 },
    ];
    this.usedRecently = [];
    this.leaderboard = new Map(); // key: lowercased username -> {name, score, correct}
    this.roundNumber = 0;

    this.status = STATUS.IDLE;
    this.current = null; // { answer, emojis, category, difficulty, revealedIndices, ... }
    this.timer = null;

    this._tick = this._tick.bind(this);
  }

  // -------------------------------------------------------------------
  // Word bank management
  // -------------------------------------------------------------------

  addWord(entry) {
    const clean = {
      answer: String(entry.answer || '').toUpperCase().trim(),
      emojis: Array.isArray(entry.emojis) ? entry.emojis.filter(Boolean) : String(entry.emojis || '').split(/\s+/).filter(Boolean),
      category: String(entry.category || 'Custom').trim() || 'Custom',
      difficulty: Math.min(3, Math.max(1, parseInt(entry.difficulty, 10) || 1)),
    };
    if (!clean.answer || clean.emojis.length === 0) {
      throw new Error('A word needs both an answer and at least one emoji/symbol.');
    }
    this.wordBank.push(clean);
    this.emit('wordBankUpdated', this.wordBank.length);
    return clean;
  }

  // -------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------

  start() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(this._tick, TICK_MS);
    this._startRound();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.status = STATUS.IDLE;
    this.current = null;
    this.emit('stateChanged', this.getPublicState());
  }

  skipRound() {
    if (this.status === STATUS.ACTIVE && this.current) {
      this.current.revealedAnswer = true;
      this.status = STATUS.REVEAL;
      this.current.revealAt = Date.now();
      this.emit('roundEnded', { reason: 'skipped', answer: this.current.answer, winner: null });
      this.emit('stateChanged', this.getPublicState());
      this._scheduleNextRound();
    }
  }

  resetLeaderboard() {
    this.leaderboard.clear();
    this.emit('leaderboardUpdated', this.getLeaderboard());
  }

  // -------------------------------------------------------------------
  // Round setup
  // -------------------------------------------------------------------

  _pickWord() {
    const pool = this.wordBank.filter((w) => !this.usedRecently.includes(w.answer));
    const source = pool.length ? pool : this.wordBank;
    const word = source[Math.floor(Math.random() * source.length)];
    this.usedRecently.push(word.answer);
    if (this.usedRecently.length > Math.max(5, Math.floor(this.wordBank.length / 2))) {
      this.usedRecently.shift();
    }
    return word;
  }

  _startRound() {
    const word = this._pickWord();
    this.roundNumber += 1;

    const timeLimitMs = Math.min(90000, 40000 + word.difficulty * 15000);
    const now = Date.now();

    this.current = {
      answer: word.answer,
      emojis: word.emojis,
      category: word.category,
      difficulty: word.difficulty,
      revealedIndices: new Set(),
      hintsGiven: 0,
      startedAt: now,
      endsAt: now + timeLimitMs,
      timeLimitMs,
      winner: null,
      revealedAnswer: false,
      hintTimes: [now + timeLimitMs * 0.4, now + timeLimitMs * 0.7],
    };
    this.status = STATUS.ACTIVE;
    this.emit('roundStarted', this.getPublicState());
    this.emit('stateChanged', this.getPublicState());
  }

  _scheduleNextRound() {
    setTimeout(() => {
      if (this.timer) this._startRound(); // only continue if game hasn't been stopped
    }, ROUND_GAP_MS);
  }

  _tick() {
    if (this.status !== STATUS.ACTIVE || !this.current) return;
    const now = Date.now();
    const c = this.current;

    // Reveal a random letter at scheduled hint checkpoints
    while (c.hintTimes.length && now >= c.hintTimes[0]) {
      c.hintTimes.shift();
      this._revealRandomLetter();
    }

    if (now >= c.endsAt) {
      c.revealedAnswer = true;
      this.status = STATUS.REVEAL;
      c.revealAt = now;
      this.emit('roundEnded', { reason: 'timeout', answer: c.answer, winner: null });
      this.emit('stateChanged', this.getPublicState());
      this._scheduleNextRound();
      return;
    }

    this.emit('tick', this.getPublicState());
  }

  _revealRandomLetter() {
    const c = this.current;
    const candidates = [];
    for (let i = 0; i < c.answer.length; i++) {
      if (/[a-zA-Z0-9]/.test(c.answer[i]) && !c.revealedIndices.has(i)) candidates.push(i);
    }
    if (!candidates.length) return;
    const idx = candidates[Math.floor(Math.random() * candidates.length)];
    c.revealedIndices.add(idx);
    c.hintsGiven += 1;
    this.emit('hintRevealed', this.getPublicState());
    this.emit('stateChanged', this.getPublicState());
  }

  // -------------------------------------------------------------------
  // Guess handling (fed by TikTok chat OR the host's manual input box)
  // -------------------------------------------------------------------

  handleGuess(username, displayName, text) {
    if (this.status !== STATUS.ACTIVE || !this.current) return null;
    if (!text) return null;

    const c = this.current;
    if (!isCorrectGuess(text, c.answer)) return null;

    // Correct! Score it, lock the round, schedule the next one.
    const elapsedMs = Date.now() - c.startedAt;
    const basePoints = 60 + c.difficulty * 40;
    const timeDecay = Math.floor(elapsedMs / 1000) * 2;
    const hintPenalty = c.hintsGiven * 15;
    const points = Math.max(10, Math.round(basePoints - timeDecay - hintPenalty));

    const key = normalize(username) || normalize(displayName) || 'anonymous';
    const entry = this.leaderboard.get(key) || { name: displayName || username, score: 0, correct: 0 };
    entry.name = displayName || username || entry.name;
    entry.score += points;
    entry.correct += 1;
    this.leaderboard.set(key, entry);

    c.winner = { name: entry.name, points };
    c.revealedAnswer = true;
    this.status = STATUS.REVEAL;
    c.revealAt = Date.now();

    this.emit('roundEnded', { reason: 'guessed', answer: c.answer, winner: c.winner });
    this.emit('leaderboardUpdated', this.getLeaderboard());
    this.emit('stateChanged', this.getPublicState());
    this._scheduleNextRound();

    return { correct: true, points, name: entry.name };
  }

  // -------------------------------------------------------------------
  // Read-only views for the front-end
  // -------------------------------------------------------------------

  getLeaderboard() {
    return [...this.leaderboard.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }

  getPublicState() {
    if (!this.current) {
      return {
        status: this.status,
        roundNumber: this.roundNumber,
        wordBankSize: this.wordBank.length,
      };
    }
    const c = this.current;
    const now = Date.now();
    const currentPoints = Math.max(
      10,
      Math.round(60 + c.difficulty * 40 - Math.floor((now - c.startedAt) / 1000) * 2 - c.hintsGiven * 15)
    );
    return {
      status: this.status,
      roundNumber: this.roundNumber,
      wordBankSize: this.wordBank.length,
      category: c.category,
      difficulty: c.difficulty,
      emojis: c.emojis,
      blanks: buildBlanks(c.answer, c.revealedIndices),
      answer: c.revealedAnswer ? c.answer : null,
      winner: c.winner,
      hintsGiven: c.hintsGiven,
      startedAt: c.startedAt,
      endsAt: c.endsAt,
      timeLimitMs: c.timeLimitMs,
      msRemaining: Math.max(0, c.endsAt - now),
      currentPoints,
    };
  }
}

export { normalize, isCorrectGuess };
