import { EventEmitter } from 'events';

// ===========================================================================
// SYMBLE - the rules, in one place
// ---------------------------------------------------------------------------
// * A secret 5-letter word is chosen.
// * Every round, 3 symbols are drawn at random and each is secretly assigned
//   one meaning:  "correct spot", "wrong spot", or "not in the guess".
//   Nobody is told which symbol means what - players have to work it out.
//   The 3 symbols are always picked to look VERY different from each other
//   (different colour AND different silhouette) so they can't be confused.
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
// * Every valid 5-letter word typed in chat that hasn't been guessed yet goes
//   straight onto the board as a new row, with no vote and no waiting.
// * Anyone who types the SECRET word wins the round instantly.
// * There's no timer and no cap on the number of guesses: the round keeps
//   going until someone solves it, the host reveals the answer, or the host
//   skips the round.
// ===========================================================================

export const WORD_LENGTH = 5;
export const CONCEPTS = ['correct', 'misplaced', 'absent'];
// ---------------------------------------------------------------------------
// Symbols. Ids must match the SVG symbols drawn in public/index.html.
//   hue   - the symbol's main colour as an angle on the colour wheel (0-360).
//           null = white/neutral.
//   tone  - 'light' or 'mid'. Two light symbols are never used together
//           (e.g. a yellow star next to a white cloud would blur together).
//   shape - silhouette family. Two symbols of the same family are never used
//           together (the clover and the cloud are both "lobed", for example).
// ---------------------------------------------------------------------------
export const SYMBOL_INFO = {
  heart:  { hue: 348,  tone: 'mid',   shape: 'heart' },
  star:   { hue: 45,   tone: 'light', shape: 'spiky' },
  moon:   { hue: 258,  tone: 'mid',   shape: 'crescent' },
  drop:   { hue: 216,  tone: 'mid',   shape: 'teardrop' },
  clover: { hue: 145,  tone: 'mid',   shape: 'lobed' },
  cat:    { hue: 27,   tone: 'mid',   shape: 'ears' },
  gem:    { hue: 180,  tone: 'mid',   shape: 'faceted' },
  donut:  { hue: 325,  tone: 'mid',   shape: 'ring' },
  cloud:  { hue: null, tone: 'light', shape: 'lobed' },
  frog:     { hue: 100, tone: 'mid', shape: 'frog' },
  mushroom: { hue: 4,   tone: 'mid', shape: 'mushroom' },
  ghost:    { hue: 292, tone: 'mid', shape: 'ghost' },
};
export const SYMBOL_POOL = Object.keys(SYMBOL_INFO);
export const MIN_HUE_GAP = 70; // degrees on the colour wheel between any two symbols in a round

/** True if two symbols are too alike in colour or shape to share a round. */
export function symbolsClash(idA, idB) {
  const a = SYMBOL_INFO[idA], b = SYMBOL_INFO[idB];
  if (a.shape === b.shape) return true;
  if (a.hue === null || b.hue === null) return a.tone === 'light' && b.tone === 'light';
  const gap = Math.abs(a.hue - b.hue);
  return Math.min(gap, 360 - gap) < MIN_HUE_GAP;
}

/** Every group of 3 symbols where no two of them clash. */
export const SYMBOL_TRIPLES = (() => {
  const out = [];
  for (let i = 0; i < SYMBOL_POOL.length; i++)
    for (let j = i + 1; j < SYMBOL_POOL.length; j++)
      for (let k = j + 1; k < SYMBOL_POOL.length; k++) {
        const t = [SYMBOL_POOL[i], SYMBOL_POOL[j], SYMBOL_POOL[k]];
        if (!symbolsClash(t[0], t[1]) && !symbolsClash(t[0], t[2]) && !symbolsClash(t[1], t[2])) out.push(t);
      }
  return out;
})();

const STATUS = { IDLE: 'idle', ACTIVE: 'active', REVEAL: 'reveal' };
const ROUND_GAP_MS = 6500; // pause between rounds so the reveal is readable

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
  constructor(answers = [], validWords = []) {
    super();
    const clean = (list) => [...new Set(
      (Array.isArray(list) ? list : [])
        .map((w) => String(w?.answer ?? w ?? '').toUpperCase().trim())
        .filter((w) => /^[A-Z]{5}$/.test(w))
    )];
    this.answers = clean(answers);
    if (!this.answers.length) this.answers = ['SHAKE', 'THICK', 'SHOOK', 'STARE', 'SOLID'];
    this.valid = new Set([...this.answers, ...clean(validWords)]);

    this.usedRecently = [];
    this.roundNumber = 0;

    this.status = STATUS.IDLE;
    this.current = null;
    this.nextRoundTimeout = null;
  }

  // -------------------------------------------------------------------
  // Word bank
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

  /** A familiar word, used by Test Mode for fake guesses. */
  randomValidWord() {
    return this.answers[Math.floor(Math.random() * this.answers.length)];
  }

  // -------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------

  start() {
    this._clearTimers();
    this._startRound();
  }

  stop() {
    this._clearTimers();
    this.status = STATUS.IDLE;
    this.current = null;
    this.emit('stateChanged', this.getPublicState());
  }

  /** Host action: end the round right now and show the answer. */
  revealAnswer() {
    if (this.status === STATUS.ACTIVE && this.current) this._endRound('revealed', null);
  }

  /** Host action: abandon the round and move on. */
  skipRound() {
    if (this.status === STATUS.ACTIVE && this.current) this._endRound('skipped', null);
  }

  _clearTimers() {
    if (this.nextRoundTimeout) clearTimeout(this.nextRoundTimeout);
    this.nextRoundTimeout = null;
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

    // 3 random symbols (always a clearly-different-looking trio), each given
    // one secret meaning for this round only.
    const symbols = shuffle(SYMBOL_TRIPLES[Math.floor(Math.random() * SYMBOL_TRIPLES.length)]);
    const concepts = shuffle(CONCEPTS);
    const symbolMap = {};
    concepts.forEach((concept, i) => { symbolMap[concept] = symbols[i]; });

    this.current = {
      answer,
      symbolMap,        // { correct: 'sun', misplaced: 'drop', absent: 'heart' } - secret until the reveal
      rows: [],          // guesses, in the order they landed on the board
      guessed: new Set(), // words already on the board, so nobody can repeat one
      startedAt: Date.now(),
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
      if (this.status === STATUS.REVEAL) this._startRound(); // only continue if the game hasn't been stopped
    }, ROUND_GAP_MS);
  }

  _endRound(reason, winner) {
    const c = this.current;
    if (!c || c.over) return;
    c.over = true;
    c.reason = reason;
    c.winner = winner;
    this.status = STATUS.REVEAL;
    this.emit('roundEnded', { reason, answer: c.answer, winner });
    this.emit('stateChanged', this.getPublicState());
    this._scheduleNextRound();
  }

  // -------------------------------------------------------------------
  // Chat input (TikTok comments, test mode, or the host's message box)
  //   returns null            -> not a guess at all (normal chatter / no round)
  //           { rejected }    -> looked like a guess but was refused
  //           { added, word } -> a fresh, valid guess - now a row on the board
  //           { correct ... } -> solved it!
  // -------------------------------------------------------------------

  handleGuess(username, displayName, text) {
    if (this.status !== STATUS.ACTIVE || !this.current) return null;
    const c = this.current;
    const word = parseGuess(text);
    if (!word) return null;

    const name = displayName || username || 'viewer';

    // The secret word always wins, no matter how many guesses are already on the board.
    if (word === c.answer) {
      this._endRound('guessed', { name });
      return { correct: true, name };
    }

    if (!this.valid.has(word)) return { rejected: 'not-a-word', word };
    if (c.guessed.has(word)) return { rejected: 'already-played', word };

    // A fresh, valid guess that doesn't conflict with anything already on the
    // board goes straight in as the next row - no vote, no waiting.
    const { states, symbols } = evaluateGuess(c.answer, word);
    c.guessed.add(word);
    c.rows.push({
      word,
      guessedBy: name,
      states,
      symbols: symbols.map((concept) => c.symbolMap[concept]),
    });

    this.emit('rowAdded', { word, name });
    this.emit('stateChanged', this.getPublicState());
    return { added: true, word };
  }

  // -------------------------------------------------------------------
  // Read-only view for the front-end
  // -------------------------------------------------------------------

  getPublicState() {
    const base = {
      status: this.status,
      roundNumber: this.roundNumber,
      wordBankSize: this.answers.length,
      wordLength: WORD_LENGTH,
    };
    if (!this.current) return { ...base, rows: [] };

    const c = this.current;
    const revealed = this.status === STATUS.REVEAL;

    // Tile colours (states) stay secret until the round is over.
    const rows = c.rows.map((r) => ({
      word: r.word,
      guessedBy: r.guessedBy,
      symbols: r.symbols,
      ...(revealed ? { states: r.states } : {}),
    }));

    return {
      ...base,
      rows,
      startedAt: c.startedAt,
      // Only revealed at the end of the round:
      answer: revealed ? c.answer : null,
      winner: revealed ? c.winner : null,
      reason: revealed ? c.reason : null,
      legend: revealed ? { ...c.symbolMap } : null,
    };
  }
}
