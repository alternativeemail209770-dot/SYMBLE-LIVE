import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';
import { GameEngine, SYMBOL_POOL, MIN_LENGTH, MAX_LENGTH, normalizeLengthConfig, REJECTION_REASONS } from './gameEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// 0. Crash prevention - a single bad message must never take the server down
// ---------------------------------------------------------------------------
process.on('uncaughtException', (err) => {
  console.error('[FATAL-CAUGHT] Uncaught exception (server kept running):', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL-CAUGHT] Unhandled promise rejection (server kept running):', reason);
});

/** Run any function safely - log and continue instead of crashing. */
function safe(label, fn) {
  return (...args) => {
    try {
      return fn(...args);
    } catch (err) {
      console.error(`[SAFE-CATCH] Error in ${label}:`, err);
      return undefined;
    }
  };
}

// ---------------------------------------------------------------------------
// 1. Basic setup
// ---------------------------------------------------------------------------
// NOTE: There is intentionally no host password. Host Controls are open to
// anyone with the page open. If you want to restrict who can reach the page
// at all, put it behind Render's own access controls or don't share the URL.
const PORT = process.env.PORT || 3000;
const DEFAULT_TIKTOK_USERNAME = process.env.DEFAULT_TIKTOK_USERNAME || '';
// The Euler Stream signing key lives ONLY in the server's environment (Render -> Environment -> SIGN_API_KEY).
// Hosts never type it in the browser.
const ENV_SIGN_API_KEY = (process.env.SIGN_API_KEY || '').trim();

const app = express();

// ---------------------------------------------------------------------------
// Which page to show. The game page is normally public/index.html, but it's easy
// to upload a new copy next to server.js by accident and leave the OLD one in
// public/ (the old page then shows stale things like "undefined" and missing
// symbols). Each page carries a <meta name="twistle-build"> number, and the
// server simply serves whichever copy is newest - so that mistake can't bite.
// ---------------------------------------------------------------------------
const PAGE_FILES = [path.join(__dirname, 'public', 'index.html'), path.join(__dirname, 'index.html')];
function pageBuild(file) {
  try {
    const m = fs.readFileSync(file, 'utf-8').match(/name=["']twistle-build["']\s+content=["'](\d+)["']/);
    return m ? Number(m[1]) : 0; // pages from before this feature count as build 0
  } catch {
    return -1; // file doesn't exist
  }
}
const pageBuilds = PAGE_FILES.map((f) => ({ file: f, build: pageBuild(f) })).filter((p) => p.build >= 0);
const PAGE = pageBuilds.reduce((best, p) => (!best || p.build > best.build ? p : best), null);
if (PAGE) {
  console.log(`[PAGE] Serving ${path.relative(__dirname, PAGE.file)} (build ${PAGE.build})`);
  const stale = pageBuilds.filter((p) => p !== PAGE);
  if (stale.length) console.warn(`[PAGE] Ignoring older copy: ${stale.map((p) => `${path.relative(__dirname, p.file)} (build ${p.build})`).join(', ')}. You can delete it.`);
} else {
  console.error('[PAGE] Could not find public/index.html!');
}
app.get(['/', '/index.html'], (req, res, next) => (PAGE ? res.sendFile(PAGE.file) : next()));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/healthz', (req, res) => res.status(200).send('ok')); // Render health check

const server = http.createServer(app);
const io = new SocketIOServer(server, { cors: { origin: '*' } });

// ---------------------------------------------------------------------------
// 2. Word lists, loaded from disk
//    words.json         - the secret words (answers), any mix of lengths from 4 to 20 letters
//    guesses.json       - every other word viewers are allowed to guess (also any length)
//    words-custom.json  - secret words the host adds from the "Add Word" tab
// ---------------------------------------------------------------------------
const WORDS_PATH = path.join(__dirname, 'words.json');
const GUESSES_PATH = path.join(__dirname, 'guesses.json');
const EXTRA_GUESSES_PATH = path.join(__dirname, 'guesses-extra.json');
const CUSTOM_WORDS_PATH = path.join(__dirname, 'words-custom.json');
const SETTINGS_PATH = path.join(__dirname, 'settings.json'); // remembers the host's word-length setting

function loadJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[WORDS] Failed to read ${filePath}:`, err);
    return fallback;
  }
}

const builtInWords = loadJsonSafe(WORDS_PATH, []);
const validGuesses = loadJsonSafe(GUESSES_PATH, []);
// Big extra dictionary, generated at install time by scripts/build-words.js (see README). Optional.
const extraGuesses = loadJsonSafe(EXTRA_GUESSES_PATH, []);
const customWords = loadJsonSafe(CUSTOM_WORDS_PATH, []);
const savedSettings = loadJsonSafe(SETTINGS_PATH, {});
const engine = new GameEngine([...builtInWords, ...customWords], [...validGuesses, ...extraGuesses], savedSettings.lengthConfig || {});
console.log(`[WORDS] ${engine.wordBankSize} secret words, ${engine.valid.size} accepted guesses. Word length: ${JSON.stringify(engine.config)}`);

// ---------------------------------------------------------------------------
// 3. Connection state (remembered so a page opened mid-stream shows the
//    right status straight away). Chat messages are NOT stored or broadcast.
// ---------------------------------------------------------------------------
const diagnostics = {
  connectionState: 'disconnected', // disconnected | connecting | connected | error
  connectionMessage: '',
  loggedSamples: 0,
};

// ---------------------------------------------------------------------------
// 4. TikTok LIVE connection management
// ---------------------------------------------------------------------------
let tiktokConnection = null;
let reconnectAttempts = 0;
const MAX_RETRIES = 3;

function extractChatFields(data) {
  // Robust fallback chain - never trust a single hardcoded field name.
  const text =
    data?.comment ?? data?.content ?? data?.text ?? data?.message ?? data?.msg ?? '';
  const username =
    data?.user?.uniqueId ??
    data?.user?.nickname ??
    data?.uniqueId ??
    data?.nickname ??
    data?.user?.displayId ??
    'unknown_user';
  const displayName =
    data?.user?.nickname ?? data?.nickname ?? data?.user?.uniqueId ?? username;
  return { text: String(text || ''), username: String(username || 'unknown_user'), displayName: String(displayName || username) };
}

function wireConnectionEvents(connection) {
  connection.on(
    ControlEvent.CONNECTED,
    safe('tiktok:connected', (state) => {
      reconnectAttempts = 0;
      diagnostics.connectionState = 'connected';
      diagnostics.connectionMessage = `Connected to room ${state?.roomId || ''}`;
      io.emit('tiktok:status', { state: 'connected', message: diagnostics.connectionMessage });
    })
  );

  connection.on(
    ControlEvent.DISCONNECTED,
    safe('tiktok:disconnected', ({ code, reason } = {}) => {
      diagnostics.connectionState = 'disconnected';
      diagnostics.connectionMessage = reason || `Disconnected (code ${code ?? 'n/a'})`;
      io.emit('tiktok:status', { state: 'disconnected', message: diagnostics.connectionMessage });
    })
  );

  connection.on(
    ControlEvent.ERROR,
    safe('tiktok:error', ({ info, exception } = {}) => {
      console.error('[TIKTOK ERROR]', info, exception);
      diagnostics.connectionState = 'error';
      diagnostics.connectionMessage = String(info || exception?.message || 'Unknown error');
      io.emit('tiktok:status', { state: 'error', message: diagnostics.connectionMessage });
    })
  );

  connection.on(
    WebcastEvent.CHAT,
    safe('tiktok:chat', (data) => {
      // One-time raw shape logging so a developer can inspect real payloads.
      if (diagnostics.loggedSamples < 5) {
        diagnostics.loggedSamples += 1;
        console.log('[RAW CHAT SAMPLE]', JSON.stringify(data));
      }

      const { text, username, displayName } = extractChatFields(data);

      engine.handleGuess(username, displayName, text);
    })
  );
}

async function connectToTikTok(username) {
  const cleanUsername = String(username || '').replace(/^@/, '').trim();
  if (!cleanUsername) {
    io.emit('tiktok:status', { state: 'error', message: 'Please enter a TikTok username.' });
    return;
  }

  if (tiktokConnection) {
    try {
      await tiktokConnection.disconnect();
    } catch (err) {
      console.error('[TIKTOK] Error disconnecting previous connection:', err);
    }
    tiktokConnection = null;
  }

  const apiKey = ENV_SIGN_API_KEY;
  if (!apiKey) {
    io.emit('tiktok:status', {
      state: 'error',
      message: 'The server has no SIGN_API_KEY set. Add it under Render -> Environment, then redeploy.',
    });
    return;
  }

  diagnostics.connectionState = 'connecting';
  diagnostics.connectionMessage = `Connecting to @${cleanUsername}...`;
  io.emit('tiktok:status', { state: 'connecting', message: diagnostics.connectionMessage });

  const connection = new TikTokLiveConnection(cleanUsername, { signApiKey: apiKey });
  wireConnectionEvents(connection);
  tiktokConnection = connection;

  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      const state = await connection.connect();
      console.log(`[TIKTOK] Connected to roomId ${state.roomId}`);
      return;
    } catch (err) {
      attempt += 1;
      console.error(`[TIKTOK] Connect attempt ${attempt} failed:`, err?.message || err);
      diagnostics.connectionMessage = `Attempt ${attempt}/${MAX_RETRIES} failed: ${err?.message || err}`;
      diagnostics.connectionState = attempt < MAX_RETRIES ? 'connecting' : 'error';
      io.emit('tiktok:status', { state: diagnostics.connectionState, message: diagnostics.connectionMessage });

      if (attempt >= MAX_RETRIES) {
        io.emit('tiktok:status', {
          state: 'error',
          message:
            'Could not connect after 3 attempts. Make sure the username is correct, the account is currently LIVE, and the SIGN_API_KEY set on Render is valid.',
        });
        return;
      }
      const backoffMs = 2000 * attempt; // 2s, 4s, 6s
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
}

async function disconnectFromTikTok() {
  if (tiktokConnection) {
    try {
      await tiktokConnection.disconnect();
    } catch (err) {
      console.error('[TIKTOK] Error during manual disconnect:', err);
    }
    tiktokConnection = null;
  }
  diagnostics.connectionState = 'disconnected';
  diagnostics.connectionMessage = 'Disconnected by host.';
  io.emit('tiktok:status', { state: 'disconnected', message: diagnostics.connectionMessage });
}

// ---------------------------------------------------------------------------
// 5. Game engine -> broadcast bridge
// ---------------------------------------------------------------------------
engine.on('stateChanged', safe('emit:stateChanged', (state) => io.emit('game:state', state)));
engine.on('wordBankUpdated', safe('emit:wordBank', (count) => io.emit('game:wordBankSize', count)));
// Every guess that gets turned away (from TikTok chat, the host message box, or
// test mode) is reported here with a reason, so Host Controls can show the host
// WHY it didn't land - never just a silent drop. See REJECTION_REASONS.
engine.on('guessRejected', safe('emit:guessRejected', (info) => {
  io.emit('game:guessRejected', { ...info, message: REJECTION_REASONS[info.reason] || 'Rejected.' });
}));
// Remember the word-length setting so it survives a restart (best effort - Render's free tier wipes files on redeploy).
engine.on('configChanged', safe('save:settings', (config) => {
  try {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify({ lengthConfig: config }, null, 2));
  } catch (err) {
    console.error('[SETTINGS] Could not save settings:', err.message);
  }
}));

// ---------------------------------------------------------------------------
// 6. Test mode - simulate fake chat locally without going LIVE
// ---------------------------------------------------------------------------
const FAKE_USERS = ['sparkle_fan22', 'tiktok_lurker', 'moon.child', 'xX_gamerpro_Xx', 'lisa.loves.cats', 'big_dave99', 'mango_mia', 'zed.zone'];
const FAKE_CHATTER = ['hi!', 'lol', 'omg', 'no way', '???', 'love this game', 'wait what', 'hmm', '😂😂😂', 'lets gooo', 'what do the symbols mean', 'sun = green??'];
let testModeTimer = null;

function startTestMode() {
  stopTestMode();
  testModeTimer = setInterval(
    safe('testMode:tick', () => {
      const user = FAKE_USERS[Math.floor(Math.random() * FAKE_USERS.length)];
      const state = engine.getPublicState();
      const active = state.status === 'active' && engine.current;
      let text;
      const roll = Math.random();
      if (active && roll < 0.04 + 0.01 * state.rows.length) {
        text = engine.current.answer; // somebody cracked it - more likely the more guesses are on the board
      } else if (active && roll < 0.7) {
        text = engine.randomValidWord(); // a fresh guess for the board
      } else {
        text = FAKE_CHATTER[Math.floor(Math.random() * FAKE_CHATTER.length)];
      }

      engine.handleGuess(user, `${user} (test)`, text);
    }),
    1200
  );
}
function stopTestMode() {
  if (testModeTimer) clearInterval(testModeTimer);
  testModeTimer = null;
}

// ---------------------------------------------------------------------------
// 7. Socket.IO wiring - Host Controls are open to anyone on the page
//    (no password gate - see note above PORT/HOST setup).
// ---------------------------------------------------------------------------
io.on('connection', (socket) => {
  // Send current snapshot to the newly connected client.
  socket.emit('game:state', engine.getPublicState());
  socket.emit('tiktok:status', { state: diagnostics.connectionState, message: diagnostics.connectionMessage });
  socket.emit('server:config', {
    defaultUsername: DEFAULT_TIKTOK_USERNAME,
    hasEnvSignKey: Boolean(ENV_SIGN_API_KEY),
    symbols: SYMBOL_POOL,
    minLength: MIN_LENGTH,
    maxLength: MAX_LENGTH,
  });

  socket.on('host:connectTikTok', safe('socket:connectTikTok', ({ username } = {}) => {
    connectToTikTok(username);
  }));

  socket.on('host:disconnectTikTok', safe('socket:disconnectTikTok', () => {
    disconnectFromTikTok();
  }));

  socket.on('host:startGame', safe('socket:startGame', () => {
    engine.start();
  }));

  socket.on('host:stopGame', safe('socket:stopGame', () => {
    engine.stop();
  }));

  socket.on('host:setLength', safe('socket:setLength', (cfg, ack) => {
    const config = engine.setLengthConfig(normalizeLengthConfig(cfg || {}, engine.config));
    if (typeof ack === 'function') ack({ ok: true, config });
  }));

  socket.on('host:revealAnswer', safe('socket:revealAnswer', () => {
    engine.revealAnswer();
  }));

  socket.on('host:skipRound', safe('socket:skipRound', () => {
    engine.skipRound();
  }));

  socket.on('host:sendMessage', safe('socket:sendMessage', ({ name, text } = {}, ack) => {
    const who = String(name || 'Host').trim() || 'Host';
    const clean = String(text || '').trim();
    if (!clean) return;

    const result = engine.handleGuess(who, who, clean);
    // Tell the sender straight away what happened to their own message - added,
    // correct, rejected (and why), or just ordinary chat that wasn't a guess.
    if (typeof ack === 'function') {
      if (!result) ack({ ok: true, outcome: 'chatter' });
      else if (result.correct) ack({ ok: true, outcome: 'correct' });
      else if (result.added) ack({ ok: true, outcome: 'added', word: result.word });
      else if (result.rejected) {
        ack({
          ok: false,
          outcome: 'rejected',
          reason: result.rejected,
          word: result.word,
          message: REJECTION_REASONS[result.rejected] || 'Rejected.',
        });
      }
    }
  }));

  socket.on('host:addWord', safe('socket:addWord', (entry, ack) => {
    try {
      const clean = engine.addWord(entry || {});
      const all = loadJsonSafe(CUSTOM_WORDS_PATH, []).map((w) => String(w?.answer ?? w)).filter((w) => /^[A-Za-z]{4,20}$/.test(w));
      if (!all.includes(clean.answer)) all.push(clean.answer);
      fs.writeFileSync(CUSTOM_WORDS_PATH, JSON.stringify(all, null, 2));
      if (typeof ack === 'function') ack({ ok: true });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  }));

  socket.on('host:testMode', safe('socket:testMode', (enabled) => {
    if (enabled) startTestMode();
    else stopTestMode();
    io.emit('testMode:status', Boolean(enabled));
  }));

  socket.on('disconnect', () => {
    // No per-socket cleanup needed - state lives on the server, not the socket.
  });
});

// ---------------------------------------------------------------------------
// 8. Go!
// ---------------------------------------------------------------------------
server.listen(PORT, () => {
  console.log(`Twistle server running on port ${PORT}`);
});
