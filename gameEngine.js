import { EventEmitter } from 'events';

// ===========================================================================
// SYMBLE - the rules, in one place
// ---------------------------------------------------------------------------
// * A secret 5-letter word is chosen.
// * Every round, 3 symbols are drawn at random and each is secretly assigned
//   one meaning:  "correct spot", "wrong spot", or "not in the guess".
//   Nobody is told which symbol means what - players have to work it out.
// * When a word is guessed, the board shows 5 symbols next to it. Symbol #1
//   describes the SECRET word's 1st letter, symbol #2 its 2nd letter, and so on
//   (NOT the letters of the guess!):
//       correct   -> the guess has that same letter in that same position
//       misplaced -> the guess contains that letter, but somewhere else
//       absent    -> the guess doesn't contain that letter (or has no spare copy)
// * Duplicate letters: a misplaced letter is marked on the EARLIEST matching
//   letter of the secret word that isn't already "correct".
// * The colours of the guessed tiles stay hidden until the round is over.
//
// HOW IT PLAYS ON TIKTOK LIVE
// * Every valid 5-letter word typed in chat is a VOTE for the next row.
//   When the turn timer runs out, the most-voted word is locked in as a row.
// * Anyone who types the SECRET word wins the round instantly (no vote needed).
// * When the board is full there's a short "final chance" window, then the
//   answer is revealed and the tiles flip to their colours.
// ===========================================================================

export const WORD_LENGTH = 5;
export const CONCEPTS = ['correct', 'misplaced', 'absent'];
// Ids must match the SVG symbols drawn in public/index.html
export const SYMBOL_POOL = ['heart', 'drop', 'sun', 'infinity', 'star', 'diamond', 'moon', 'bolt', 'plus', 'triangle'];

export const DEFAULT_SETTINGS = {
  maxRows: 8,        // rows on the board (the original Symble has 8)
  turnSeconds: 20,   // how long the crowd has to vote for each row
  finalSeconds: 20,  // "last chance" window after the last row is locked
  roundSeconds: 300, // hard cap on a whole round
};

// Points - tweak to taste.
const SCORING = {
  base: 100,         // for solving the round
  perUnusedRow: 20,  // + this for every row still empty (fewer clues used = more points)
  timeBonusMax: 60,  // + up to this, shrinking as the round clock runs down
  votePoints: 5,     // for everyone who voted for the word that got locked in
};

const STATUS = { IDLE: 'idle', ACTIVE: 'active', REVEAL: 'reveal' };
const ROUND_GAP_MS = 6500; // pause between rounds so the reveal is readable
const TICK_MS = 250;
const TALLY_BROADCAST_MS = 400;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Lowercase, strip accents and punctuation - used for user keys. */
export function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Turn a chat comment into a guess, or null if it isn't one.
 * Accepts "crane", "Crane!", "!guess crane", "!g crane". Anything with other
 * words in it is normal chatter and is ignored.
 */
export function parseGuess(text) {
  const tokens = String(text || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length && /^[!/](g|guess)$/i.test(tokens[0])) tokens.shift();
  if (tokens.length !== 1) return null;
  const word = tokens[0].replace(/^[!/]/, '').replace(/[!?.,:;'"]+$/, '');
  return /^[A-Za-z]{5}$/.test(word) ? word.toUpperCase() : null;
}

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const clamp = (n, lo, hi, fallback) => {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return fallback;
  return Math.min(hi, Math.max(lo, v));
};

/**
 * Score one guess against the answer.
 *   states[i]  - status of the i-th GUESSED letter (Wordle style; hidden until the end)
 *   symbols[i] - status of the i-th letter of the ANSWER (what the symbol column shows)
 * Each is 'correct' | 'misplaced' | 'absent'.
 */
export function evaluateGuess(answer, guess) {
  const n = answer.length;
  const states = new Array(n).fill('absent');
  const symbols = new Array(n).fill('absent');
  const unmatched = {}; // letter -> how many copies in the answer aren't "correct" yet

  for (let i = 0; i < n; i++) {
    if (guess[i] === answer[i]) {
      states[i] = 'correct';
      symbols[i] = 'correct';
    } else {
      unmatched[answer[i]] = (unmatched[answer[i]] || 0) + 1;
    }
  }

  // Guess side: hand out "misplaced" left to right while spare copies remain.
  const spare = { ...unmatched };
  for (let i = 0; i < n; i++) {
    if (states[i] === 'correct') continue;
    if (spare[guess[i]] > 0) {
      states[i] = 'misplaced';
      spare[guess[i]] -= 1;
    }
  }

  // Answer side: each misplaced guess letter marks the EARLIEST unmatched copy in the answer.
  const toMark = {};
  for (const letter of Object.keys(unmatched)) toMark[letter] = unmatched[letter] - spare[letter];
  for (let i = 0; i < n; i++) {
    if (symbols[i] === 'correct') continue;
    if (toMark[answer[i]] > 0) {
      symbols[i] = 'misplaced';
      toMark[answer[i]] -= 1;
    }
  }
  return { states, symbols };
}

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

export class GameEngine extends EventEmitter {
  /**
   * @param {string[]} answers     words that can be the secret word
   * @param {string[]} validWords  extra words that are accepted as guesses
   */
  constructor(answers = [], validWords = [], settings = {}) {
    super();
    const clean = (list) => [...new Set(
      (Array.isArray(list) ? list : [])
        .map((w) => String(w?.answer ?? w ?? '').toUpperCase().trim())
        .filter((w) => /^[A-Z]{5}$/.test(w))
    )];
    this.answers = clean(answers);
    if (!this.answers.length) this.answers = ['SHAKE', 'THICK', 'SHOOK', 'STARE', 'SOLID'];
    this.valid = new Set([...this.answers, ...clean(validWords)]);

    this.settings = { ...DEFAULT_SETTINGS };
    this.updateSettings(settings, { silent: true });

    this.usedRecently = [];
    this.leaderboard = new Map(); // key -> { name, score, correct }
    this.roundNumber = 0;
    this.voteSeq = 0;

    this.status = STATUS.IDLE;
    this.current = null;
    this.timer = null;
    this.nextRoundTimeout = null;
    this.broadcastTimeout = null;

    this._tick = this._tick.bind(this);
  }

  // -------------------------------------------------------------------
  // Word bank + settings
  // -------------------------------------------------------------------

  get wordBankSize() { return this.answers.length; }

  addWord(entry) {
    const answer = String(entry?.answer ?? entry ?? '').toUpperCase().trim();
    if (!/^[A-Z]{5}$/.test(answer)) {
      throw new Error('A Symble word must be exactly 5 letters (A-Z, no spaces).');
    }
    if (!this.answers.includes(answer)) this.answers.push(answer);
    this.valid.add(answer);
    this.emit('wordBankUpdated', this.answers.length);
    return { answer };
  }

  /** A familiar word, used by Test Mode for fake votes. */
  randomValidWord() {
    return this.answers[Math.floor(Math.random() * this.answers.length)];
  }

  updateSettings(patch = {}, { silent = false } = {}) {
    const s = this.settings;
    s.maxRows = clamp(patch.maxRows ?? s.maxRows, 5, 10, DEFAULT_SETTINGS.maxRows);
    s.turnSeconds = clamp(patch.turnSeconds ?? s.turnSeconds, 8, 90, DEFAULT_SETTINGS.turnSeconds);
    s.finalSeconds = clamp(patch.finalSeconds ?? s.finalSeconds, 5, 60, DEFAULT_SETTINGS.finalSeconds);
    s.roundSeconds = clamp(patch.roundSeconds ?? s.roundSeconds, 60, 900, DEFAULT_SETTINGS.roundSeconds);
    if (!silent) this.emit('settingsUpdated', { ...s });
    return { ...s };
  }

  // -------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------

  start() {
    this._clearTimers();
    this.timer = setInterval(this._tick, TICK_MS);
    this._startRound();
  }

  stop() {
    this._clearTimers();
    this.status = STATUS.IDLE;
    this.current = null;
    this.emit('stateChanged', this.getPublicState());
  }

  skipRound() {
    if (this.status === STATUS.ACTIVE && this.current) this._endRound('skipped', null);
  }

  resetLeaderboard() {
    this.leaderboard.clear();
    this.emit('leaderboardUpdated', this.getLeaderboard());
  }

  _clearTimers() {
    if (this.timer) clearInterval(this.timer);
    if (this.nextRoundTimeout) clearTimeout(this.nextRoundTimeout);
    if (this.broadcastTimeout) clearTimeout(this.broadcastTimeout);
    this.timer = null;
    this.nextRoundTimeout = null;
    this.broadcastTimeout = null;
  }

  // -------------------------------------------------------------------
  // Round setup
  // -------------------------------------------------------------------

  _pickWord() {
    const pool = this.answers.filter((w) => !this.usedRecently.includes(w));
    const source = pool.length ? pool : this.answers;
    const word = source[Math.floor(Math.random() * source.length)];
    this.usedRecently.push(word);
    if (this.usedRecently.length > Math.min(150, Math.floor(this.answers.length / 2))) this.usedRecently.shift();
    return word;
  }

  _startRound() {
    const answer = this._pickWord();
    this.roundNumber += 1;

    // 3 random symbols, each given one secret meaning for this round only.
    const symbols = shuffle(SYMBOL_POOL).slice(0, 3);
    const concepts = shuffle(CONCEPTS);
    const symbolMap = {};
    concepts.forEach((concept, i) => { symbolMap[concept] = symbols[i]; });

    const s = this.settings;
    const now = Date.now();
    this.current = {
      answer,
      symbolMap,                  // { correct: 'sun', misplaced: 'drop', absent: 'heart' } - secret until the reveal
      rows: [],                   // locked-in guesses
      votes: new Map(),           // userKey -> { word, name, at }
      maxRows: s.maxRows,
      phase: 'voting',            // 'voting' | 'final'
      startedAt: now,
      endsAt: now + s.roundSeconds * 1000,
      timeLimitMs: s.roundSeconds * 1000,
      turnMs: s.turnSeconds * 1000,
      turnEndsAt: now + s.turnSeconds * 1000,
      finalEndsAt: null,
      winner: null,
      reason: null,
      over: false,
    };
    this.status = STATUS.ACTIVE;
    this.emit('roundStarted', this.getPublicState());
    this.emit('stateChanged', this.getPublicState());
  }

  _scheduleNextRound() {
    if (this.nextRoundTimeout) clearTimeout(this.nextRoundTimeout);
    this.nextRoundTimeout = setTimeout(() => {
      this.nextRoundTimeout = null;
      if (this.timer) this._startRound(); // only continue if the game hasn't been stopped
    }, ROUND_GAP_MS);
  }

  _endRound(reason, winner) {
    const c = this.current;
    if (!c || c.over) return;
    c.over = true;
    c.reason = reason;
    c.winner = winner;
    c.votes.clear();
    this.status = STATUS.REVEAL;
    c.revealAt = Date.now();
    this.emit('roundEnded', { reason, answer: c.answer, winner });
    this.emit('stateChanged', this.getPublicState());
    this._scheduleNextRound();
  }

  // -------------------------------------------------------------------
  // Clock: locks in rows and ends rounds
  // -------------------------------------------------------------------

  _tick() {
    if (this.status !== STATUS.ACTIVE || !this.current) return;
    const c = this.current;
    const now = Date.now();

    if (now >= c.endsAt) return this._endRound('timeout', null);
    if (c.phase === 'final') {
      if (now >= c.finalEndsAt) this._endRound('out-of-rows', null);
      return;
    }
    if (now >= c.turnEndsAt) this._lockTurn(now);
  }

  _tally() {
    const c = this.current;
    const byWord = new Map();
    for (const [key, v] of c.votes) {
      const e = byWord.get(v.word) || { word: v.word, count: 0, first: v.at, voters: [] };
      e.count += 1;
      e.first = Math.min(e.first, v.at);
      e.voters.push({ key, name: v.name });
      byWord.set(v.word, e);
    }
    return [...byWord.values()].sort((a, b) => b.count - a.count || a.first - b.first);
  }

  _lockTurn(now) {
    const c = this.current;
    const tally = this._tally();

    if (!tally.length) {
      // Nobody voted - give the crowd another full turn instead of wasting a row.
      c.turnEndsAt = now + c.turnMs;
      this.emit('stateChanged', this.getPublicState());
      return;
    }

    const top = tally[0];
    const { states, symbols } = evaluateGuess(c.answer, top.word);
    c.rows.push({
      word: top.word,
      votes: top.count,
      states,
      symbols: symbols.map((concept) => c.symbolMap[concept]),
    });

    for (const voter of top.voters) this._addPoints(voter.key, voter.name, SCORING.votePoints, false);
    c.votes.clear();

    if (c.rows.length >= c.maxRows) {
      c.phase = 'final';
      c.finalEndsAt = Math.min(c.endsAt, now + this.settings.finalSeconds * 1000);
    } else {
      c.turnEndsAt = now + c.turnMs;
    }

    this.emit('rowLocked', { word: top.word, votes: top.count });
    this.emit('leaderboardUpdated', this.getLeaderboard());
    this.emit('stateChanged', this.getPublicState());
  }

  _queueBroadcast() {
    if (this.broadcastTimeout) return;
    this.broadcastTimeout = setTimeout(() => {
      this.broadcastTimeout = null;
      if (this.status === STATUS.ACTIVE) this.emit('stateChanged', this.getPublicState());
    }, TALLY_BROADCAST_MS);
  }

  _points(c, now) {
    const rowsLeft = Math.max(0, c.maxRows - c.rows.length);
    const timeLeft = Math.max(0, Math.min(1, (c.endsAt - now) / c.timeLimitMs));
    return Math.round(SCORING.base + rowsLeft * SCORING.perUnusedRow + SCORING.timeBonusMax * timeLeft);
  }

  _addPoints(key, name, points, isWin) {
    const entry = this.leaderboard.get(key) || { name, score: 0, correct: 0 };
    entry.name = name || entry.name;
    entry.score += points;
    if (isWin) entry.correct += 1;
    this.leaderboard.set(key, entry);
    return entry;
  }

  // -------------------------------------------------------------------
  // Chat input (TikTok comments, test mode, or the host's message box)
  //   returns null            -> not a guess at all (normal chatter / no round)
  //           { rejected }    -> looked like a guess but was refused
  //           { vote, word }  -> counted as a vote for the next row
  //           { correct ... } -> solved it!
  // -------------------------------------------------------------------

  handleGuess(username, displayName, text) {
    if (this.status !== STATUS.ACTIVE || !this.current) return null;
    const c = this.current;
    const word = parseGuess(text);
    if (!word) return null;

    const key = normalize(username) || normalize(displayName) || 'anonymous';
    const name = displayName || username || 'viewer';

    // The secret word always wins, whether or not the board is still taking votes.
    if (word === c.answer) {
      const points = this._points(c, Date.now());
      const entry = this._addPoints(key, name, points, true);
      this._endRound('guessed', { name: entry.name, points });
      this.emit('leaderboardUpdated', this.getLeaderboard());
      return { correct: true, points, name: entry.name };
    }

    if (!this.valid.has(word)) return { rejected: 'not-a-word', word };
    if (c.rows.some((r) => r.word === word)) return { rejected: 'already-played', word };
    if (c.phase === 'final') return { rejected: 'board-full', word };

    c.votes.set(key, { word, name, at: ++this.voteSeq }); // seq (not clock) so ties are always broken by who got there first
    this._queueBroadcast();
    return { vote: true, word };
  }

  // -------------------------------------------------------------------
  // Read-only views for the front-end
  // -------------------------------------------------------------------

  getLeaderboard() {
    return [...this.leaderboard.values()].sort((a, b) => b.score - a.score).slice(0, 10);
  }

  getSettings() { return { ...this.settings }; }

  getPublicState() {
    const base = {
      status: this.status,
      roundNumber: this.roundNumber,
      wordBankSize: this.answers.length,
      wordLength: WORD_LENGTH,
      serverNow: Date.now(),
    };
    if (!this.current) return { ...base, maxRows: this.settings.maxRows, rows: [] };

    const c = this.current;
    const now = Date.now();
    const revealed = this.status === STATUS.REVEAL;

    // Tile colours (states) stay secret until the round is over.
    let rows = c.rows.map((r) => ({
      word: r.word,
      votes: r.votes,
      symbols: r.symbols,
      ...(revealed ? { states: r.states } : {}),
    }));
    if (revealed && c.winner && rows.length < c.maxRows) {
      rows.push({
        word: c.answer,
        votes: 0,
        solved: true,
        symbols: new Array(WORD_LENGTH).fill(c.symbolMap.correct),
        states: new Array(WORD_LENGTH).fill('correct'),
      });
    }

    const tally = revealed ? [] : this._tally();
    return {
      ...base,
      maxRows: c.maxRows,
      rows,
      phase: c.phase,
      startedAt: c.startedAt,
      endsAt: c.endsAt,
      timeLimitMs: c.timeLimitMs,
      msRemaining: Math.max(0, c.endsAt - now),
      turnMs: c.turnMs,
      turnEndsAt: c.turnEndsAt,
      finalEndsAt: c.finalEndsAt,
      finalMs: this.settings.finalSeconds * 1000,
      tally: tally.slice(0, 5).map((t) => ({ word: t.word, count: t.count })),
      voters: c.votes.size,
      currentPoints: revealed ? 0 : this._points(c, now),
      scoring: { ...SCORING }, // lets the screen count the points down between updates
      // Only revealed at the end of the round:
      answer: revealed ? c.answer : null,
      winner: revealed ? c.winner : null,
      reason: revealed ? c.reason : null,
      legend: revealed ? { ...c.symbolMap } : null,
    };
  }
}
