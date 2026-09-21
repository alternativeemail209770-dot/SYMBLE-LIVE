// ---------------------------------------------------------------------------
// build-words.js - builds the big "accepted guesses" dictionary.
//
// Runs automatically after `npm install` (so on every Render deploy) and can be
// run by hand with `npm run build:words`. It:
//   1. downloads several public English word lists,
//   2. merges them with guesses.json + words.json,
//   3. drops junk (no vowels, keyboard-mash, absurd consonant runs) and a baseline
//      blocklist of profanity / slurs / explicit terms (so they never land on stream),
//   4. writes guesses-extra.json, which server.js loads next to guesses.json.
//
// It NEVER fails the install: if a download fails, the game still starts with
// whatever lists it could get (at minimum the guesses.json shipped in the repo).
//
// Add your own sources with the WORD_SOURCES env var (comma-separated URLs of
// plain-text files, one word per line). Add your own blocked words in an optional
// blocklist.txt next to server.js (one word per line).
// ---------------------------------------------------------------------------
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'guesses-extra.json');
const TARGET = 400000;

const SOURCES = [
  { name: 'dwyl words_alpha', url: 'https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt' },
  { name: 'SOWPODS (Collins Scrabble)', url: 'https://raw.githubusercontent.com/jesstess/Scrabble/master/scrabble/sowpods.txt' },
  { name: 'ENABLE', url: 'https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt' },
  ...String(process.env.WORD_SOURCES || '')
    .split(',').map((u) => u.trim()).filter(Boolean)
    .map((url) => ({ name: url, url })),
];

// --- blocklist ---------------------------------------------------------------
// Exact stems, expanded with common endings, plus a few prefixes that have no innocent words.
const BLOCK_STEMS = [
  'fuck', 'shit', 'cunt', 'bitch', 'whore', 'slut', 'dick', 'pussy', 'twat', 'wank', 'jizz',
  'boob', 'penis', 'vagina', 'porn', 'rape', 'rapist', 'molest', 'pedo', 'paedo', 'incest',
  'orgasm', 'blowjob', 'handjob', 'masturbate', 'semen', 'sperm', 'nazi', 'kike', 'chink', 'gook',
  'wetback', 'tranny', 'retard', 'faggot', 'dyke', 'darkie', 'paki', 'raghead', 'cocaine', 'heroin',
  'jerkoff', 'dildo', 'slutty', 'hooker', 'stripper',
];
// Exact-only entries (no endings added, so innocent words like SPICY, TITER or COCKPIT stay legal).
const BLOCK_ONLY = ['SPIC', 'SPICS', 'SPICK', 'SPICKS', 'TITS', 'TITTY', 'TITTIES', 'COCK', 'COCKS', 'COON', 'COONS', 'FAGS', 'NEGRO', 'NEGROES', 'ANUS', 'ANUSES', 'CUMS', 'CUMMING', 'ASSHOLE', 'ASSHOLES'];
const ENDINGS = ['', 'S', 'ES', 'ED', 'ING', 'ER', 'ERS', 'Y', 'IER', 'IEST', 'ISH', 'IN', 'INS', 'ERY'];
const BLOCK_EXACT = new Set();
for (const s of BLOCK_STEMS) for (const e of ENDINGS) BLOCK_EXACT.add(s.toUpperCase() + e);
for (const w of BLOCK_ONLY) BLOCK_EXACT.add(w);
// These start-of-word patterns have no innocent words worth keeping.
const BLOCK_PREFIX = /^(NIGG|NIGR|FAGG|CUNT|FUCK|MOTHERF|SHITT|SHITH|BULLSHIT|JACKASS|DUMBASS|ASSHOL|WHORE|PORNO|BUKKAKE|CLITOR|SCROTUM)/;

function loadCustomBlocklist() {
  try {
    return fs.readFileSync(path.join(root, 'blocklist.txt'), 'utf-8')
      .split(/\r?\n/).map((w) => w.trim().toUpperCase()).filter(Boolean);
  } catch { return []; }
}
for (const w of loadCustomBlocklist()) BLOCK_EXACT.add(w);

// --- sanity filter -------------------------------------------------------------
function looksLikeAWord(w) {
  if (!/^[A-Z]{4,20}$/.test(w)) return false;
  if (!/[AEIOUY]/.test(w)) return false;          // needs a vowel
  if (/(.)\1{3,}/.test(w)) return false;          // "AAAA", "ZZZZ" - keyboard mash
  if (/[^AEIOUY]{7,}/.test(w)) return false;      // absurd consonant runs
  return true;
}
const allowed = (w) => looksLikeAWord(w) && !BLOCK_EXACT.has(w) && !BLOCK_PREFIX.test(w);

// --- download ------------------------------------------------------------------
async function download(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(path.join(root, file), 'utf-8')); } catch { return []; }
}

async function main() {
  const base = new Set([...readJson('words.json'), ...readJson('guesses.json')].map((w) => String(w).toUpperCase()));
  const extra = new Set();
  console.log(`[WORDS] Base lists (words.json + guesses.json): ${base.size.toLocaleString()} words`);

  for (const src of SOURCES) {
    try {
      const text = await download(src.url);
      let seen = 0, added = 0;
      for (const line of text.split(/\r?\n/)) {
        const w = line.trim().toUpperCase();
        if (!w) continue;
        seen++;
        if (allowed(w) && !base.has(w) && !extra.has(w)) { extra.add(w); added++; }
      }
      console.log(`[WORDS] ${src.name}: ${seen.toLocaleString()} lines, ${added.toLocaleString()} new words`);
    } catch (err) {
      console.warn(`[WORDS] Could not download ${src.name}: ${err.message}`);
    }
  }

  const total = new Set([...base, ...extra]);
  if (extra.size === 0) {
    console.warn('[WORDS] No extra words downloaded - the game will use the built-in lists only.');
    return;
  }
  fs.writeFileSync(OUT, JSON.stringify([...extra].sort()));
  console.log(`[WORDS] Wrote ${path.basename(OUT)}: ${extra.size.toLocaleString()} extra words.`);
  console.log(`[WORDS] Total accepted guesses: ${total.size.toLocaleString()}` +
    (total.size >= TARGET ? ' (target of 400,000 reached)' : ` (below the 400,000 target - add more lists with the WORD_SOURCES env var)`));
}

main().catch((err) => console.warn('[WORDS] Word-list build skipped:', err?.message || err)).finally(() => process.exit(0));
