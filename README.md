# TWISTLE — TikTok LIVE Word Guessing Game

A fully automated word game that reads your TikTok LIVE chat in real time.
Viewers work together to crack a secret word using a board of guesses and a
row of mystery symbols. **You choose the word length: any single length from
4 to 20 letters, or a random length picked each round from a range you set.**
There's no timer and no limit on guesses — every valid word of the right length
that hasn't been tried yet goes straight onto the board, and the round keeps going until someone types the secret word,
the host reveals the answer, or the host skips the round.

There is **no host password**. The gear icon opens Host Controls for anyone
with the page open — see "A note on Host Controls" below.

This guide assumes **zero coding experience**. Follow it top to bottom in
order. It should take about 20–30 minutes the first time.

---

## How the game works

**The rules of Twistle**

- Every round has a secret word (4–20 letters, set by the host) and **3 random symbols**. The three
  are always picked to look very different from each other (a different colour
  *and* a different shape), so they can't be mixed up. Each symbol secretly
  means one thing, and nobody is told which:
  - *right spot* — that letter is in the guess, in the same position
  - *wrong spot* — that letter is in the guess, but somewhere else
  - *not in your guess* — that letter isn't in the guess
- Every guess on the board gets a row of **symbols (one per letter)** beside or below it. The catch:
  the symbols line up with the letters of the **secret word**, not with the
  letters of the guess. Symbol 1 is about the secret word's 1st letter,
  symbol 2 about its 2nd letter, and so on.
- Repeated letters: if a guess has only one copy of a doubled letter and it's
  in the wrong spot, the *earliest* matching letter of the secret word gets
  the "wrong spot" symbol. If it's in the right spot, only that one gets
  "right spot" and nothing is revealed about the other copy.
- The colours of the guessed tiles stay hidden until the round ends. Then the
  tiles flip, the answer appears, and the symbols' meanings are revealed.

The **?** button in the top bar shows this to your viewers, with a worked example.

**How it plays in TikTok chat**

- Any real word with the same number of letters as the secret word, that
  hasn't already been guessed this round, goes **straight onto the board** — no
  vote, no waiting. Its row of symbols (one per letter) appears immediately.
- **Anyone who types the secret word wins the round instantly.**
- There's no timer and no cap on the number of guesses. The round keeps going
  until someone solves it, or the host reveals the answer / skips the round
  from Host Controls → Game. A few seconds after a round ends, the next one
  starts automatically.
- Chat that isn't a single word of the right length (like "lol" or "omg so
  hard") is ignored by the game. Viewers can also type `!guess crane` if they
  prefer. The board always tells viewers how many letters to type.
- If a word has already been guessed this round, or isn't in the word list,
  the game simply ignores it — the viewer can try something else.

---

## What you're getting (the files)

```
twistle-live-game/
├── server.js            <- the "brain": connects to TikTok, runs the game
├── gameEngine.js         <- the Twistle rules: word lengths, symbols, rows, scoring
├── words.json             <- the secret words: ~5,900 everyday words, 4 to 20 letters long
├── guesses.json           <- every other word viewers may guess (~105,000, 4 to 20 letters)
├── scripts/
│   └── build-words.js       <- downloads big public word lists at install time -> guesses-extra.json (400,000+ goal)
├── package.json           <- tells the server what software it needs
├── .env.example            <- template for your settings
├── .gitignore
├── README.md              <- this file
└── public/
    └── index.html           <- everything you see on screen (no password needed)
```

(The symbols are drawn in `public/index.html`; which ones can appear together is decided in
`gameEngine.js`. There are 12 cute characters and 66 different trios.)

You never need to open or understand the code. You will only:
1. Get a free API key.
2. Upload these files to GitHub (drag-and-drop, no commands).
3. Point Render.com at that GitHub repo.
4. Open the resulting web page on your phone and press "Connect."

---

## Step 1 — Get your free TikTok signing key (Euler Stream)

TikTok doesn't publish an official chat API, so this game (like every TikTok
LIVE bot/game) relies on a trusted signing service called **Euler Stream** to
securely open the connection. This is the industry-standard, safe way to do
it — not a workaround.

1. Go to **https://www.eulerstream.com** and click **Sign Up** (free).
2. Once logged in, find **API Keys** in your dashboard and create a new key.
3. Copy that key somewhere safe — you'll paste it into the game later. (You
   can also skip this step for now and just use **Test Mode**, which needs
   no key at all — see Step 6.)

The free tier has modest rate limits, which is plenty for one live stream at
a time.

---

## Step 2 — Get the files onto your computer

Download every file listed above, keeping the exact folder structure (the
`public` folder must contain `index.html` inside it, not next to it).

---

## Step 3 — Upload the files to GitHub

1. Go to **https://github.com** and sign in (or create a free account).
2. Click the **+** icon (top right) → **New repository**.
3. Name it `twistle-live-game`, keep it **Public** or **Private** (either
   works), leave everything else unchecked, and click **Create repository**.
4. On the next page, click **"uploading an existing file"**.
5. Drag in **all the files and folders** from Step 2 (yes, you can drag the
   whole `twistle-live-game` folder contents in one go, including the
   `public` sub-folder — GitHub keeps the folder structure).
6. Scroll down and click **Commit changes**.

You now have a GitHub repository Render can deploy from.

---

## Step 4 — Deploy to Render.com

1. Go to **https://render.com** and sign up (free) — the easiest way is
   "Sign up with GitHub," which also connects your account automatically.
2. From the Render dashboard, click **New +** → **Web Service**.
3. Choose **Build and deploy from a Git repository**, then select the
   `twistle-live-game` repo you just created. (If you don't see it, click
   "Configure account" and give Render access to that repo.)
4. Fill in the settings:
   - **Name**: anything you like, e.g. `twistle-live`
   - **Region**: pick the one closest to you
   - **Branch**: `main`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free is fine to start
5. Scroll to **Environment Variables** and add these (click "Add Environment
   Variable" for each) — `SIGN_API_KEY` is needed to connect to TikTok LIVE (not for Test Mode); `DEFAULT_TIKTOK_USERNAME` is optional:

   | Key | Value |
   |---|---|
   | `SIGN_API_KEY` | **required for going LIVE** — paste your Euler Stream key from Step 1. The game page never asks for it; it is read only from here |
   | `DEFAULT_TIKTOK_USERNAME` | your TikTok username without the @ (optional) |

6. Click **Create Web Service**. Render will install everything and start
   the server — this takes 2–5 minutes the first time. Watch the "Logs" tab;
   when you see `Twistle server running on port ...` it's ready.
7. At the top of the page, Render shows your live URL, something like
   `https://twistle-live.onrender.com`. Open it — that's your game!

> **Note on the free tier:** Render's free web services "spin down" after
> 15 minutes of no traffic and take ~30–60 seconds to wake back up on the
> next visit. Open the page a minute or two before you go live to warm it
> up. If this matters to you, Render's cheapest paid tier removes the
> spin-down.

---

## Step 5 — Open the game and open Host Controls

1. On your phone (or computer), open your Render URL.
2. Tap the **⚙️ gear icon** in the top-right corner. A panel slides up with
   tabs: **Connect / Game / Message / Add Word / Test**. There's nothing to
   unlock — it opens straight away.

> **A note on Host Controls:** anyone who opens your game's URL can tap the
> gear icon and use these controls (start/stop the game, connect to a
> different TikTok account, etc.). Only share the link with people you
> trust, and keep the page open on your own device/stream capture rather
> than posting the URL publicly.

---

## Step 6 — Test everything without going LIVE

You don't need to be live on TikTok to try this out:

1. Open the **Test** tab and flip the "Simulate fake TikTok chat" switch
   **on**. Fake viewers will start guessing words every second or so, and
   every so often one of them will "solve" the puzzle.
2. Open the **Game** tab and tap **▶ Start Game**.
3. Watch the board: each fresh, valid guess lands on the board immediately
   with its row of symbols, and when a round ends the tiles flip to their colours
   and the answer and symbol meanings are revealed.
4. You can also type guesses yourself in the **Message** tab. A fresh, valid
   word of the right length goes straight onto the board, and the secret word
   wins the round.
5. The **Connect** tab shows the current connection status underneath the
   buttons (for example "Connected to room ..."), and any error message if
   something goes wrong. Chat messages themselves are never displayed or
   stored.

When you're happy, turn Test Mode back **off**.

---

## Step 7 — Go live on TikTok

1. Start your TikTok LIVE stream from your phone as normal.
2. Back in the game page, open **Host Controls → Connect**.
3. Enter your **TikTok username** (no @). There is no key field: the server uses the
   `SIGN_API_KEY` you set on Render.
4. Tap **Connect to LIVE**. The status dot at the top turns green once
   connected. The game will automatically retry the connection up to 3
   times if it fails before showing an error.
5. Go to **Game → ▶ Start Game**. Real TikTok comments now flow directly
   into the game — no further setup needed.
6. Share your screen (or point your camera at your phone) so your viewers
   can see the board while they type answers in your normal TikTok chat.
   A good pinned comment: *"Type a word with the right number of
   letters — a good guess goes straight on the board. Type the secret word to
   win!"*
7. When you want to move on, use **Host Controls → Game → Reveal Answer**
   (shows the answer and ends the round normally) or **Skip Round** (abandons
   the current round). Either way, the next round starts automatically a few
   seconds later.

---

## The big dictionary (400,000+ accepted guesses)

`npm install` (which Render runs on every deploy) also runs `scripts/build-words.js`.
It downloads several public English word lists (dwyl words_alpha, Collins SOWPODS, ENABLE),
merges them with `guesses.json`, removes junk and a baseline list of profanity/slurs/explicit
terms, and saves the result as `guesses-extra.json`, which the server loads automatically.
Secret words still come only from `words.json`, so answers stay everyday words.

- Open the Render **Logs** tab after a deploy and look for `[WORDS] Total accepted guesses: ...`.
  It tells you whether the 400,000 target was reached.
- If a download fails, the game still starts with the lists it has (never less than `guesses.json`).
- To add more sources, set an environment variable `WORD_SOURCES` on Render to one or more
  comma-separated URLs of plain-text lists (one word per line).
- To block extra words, add a `blocklist.txt` next to `server.js` (one word per line).

## Fullscreen

The **⛶** button in the top bar (or the **F** key) enters and leaves fullscreen. The game keeps its
tall phone-shaped column, so on a wide screen you get bars on the sides instead of a stretched board.
iPhone Safari doesn't allow fullscreen for web pages, so the button is hidden there.

## Customizing the game

- **Round control**: Host Controls → **Game**. Start/Stop the game, or use
  **Reveal Answer** / **Skip Round** to end the current round early — there's
  no timer, so a round otherwise runs until someone solves it.
- **Word length**: Host Controls → **Game → Word length**. Choose **Fixed
  length** and pick anything from 4 to 20 letters, or **Random range** and pick
  a shortest and longest length — each round then uses a random length in that
  range (never the same length twice in a row, when there's a choice). The
  choice is remembered if the server restarts. A change takes effect from the
  *next* round; tap **Skip Round** to switch right away. The tiles and symbols
  resize themselves for every length: short words show the letters with the
  symbols beside them, longer words put the symbols in a strip underneath, and
  the longest words wrap onto a second (or third) line so nothing gets tiny.
- **Add secret words**: Host Controls → **Add Word**. Type any word from 4 to 20
  letters and tap **Add to Word Bank**. It can come up as a secret word from
  then on (in rounds of that length).
  Render's free tier wipes files whenever it redeploys, so to keep a word
  forever, add it to `words.json` on GitHub as well (see next point).
- **Change the built-in words**: open `words.json` on GitHub, click the pencil
  (✏️) icon to edit, and add or remove words. Each one is capital letters in quotes
  (any length from 4 to 20), followed by a comma (except the last one). The
  game sorts them by length itself, so they can go anywhere in the list. Commit, then redeploy in
  Render (Manual Deploy → Deploy latest commit). `guesses.json` works the same
  way; it's the (much bigger) list of extra words viewers may guess with, and
  you rarely need to touch it. Anything in
  `words.json` is also accepted as a guess automatically.

---

## Troubleshooting

**The page still shows old things: a "Top 10" box, a "Live Chat" box, the word
"undefined", a white line between the letters and symbols, or some symbols
missing.**
You're looking at an out-of-date `index.html`. The newest one must sit **inside
the `public` folder** on GitHub (`public/index.html`), replacing the old file.
Open the `public` folder on GitHub, click `index.html`, then the pencil (✏️) and
paste in the new contents (or use *Add file → Upload files* while inside
`public`). Then in Render click **Manual Deploy → Deploy latest commit** and
refresh the page. As a safety net, the server now also notices when two copies
exist and serves the newer one; the Render **Logs** tab shows which one it chose
(look for `[PAGE] Serving ...`).

**Guesses typed in your live chat never show up on the board.**
Your comments aren't reaching the server. Double-check: (a) you are
actually LIVE on TikTok, (b) the username you typed matches your TikTok
handle exactly, (c) the status dot is green/"Connected." If in doubt, turn
on Test Mode (Host Controls → Test) — if fake guesses appear on the board,
the game itself is fine and the problem is the TikTok connection.

**The Connect tab shows "error" after 3 attempts.**
Usually means either the username is wrong, you're not currently live, or
the `SIGN_API_KEY` on Render is missing/invalid (the Connect tab shows a red note if the server has no key at all). Re-check Step 7 and try again —
the game always retries automatically before giving up.

**A viewer's guess didn't appear on the board.**
The game silently ignores anything that isn't a single word with exactly as
many letters as the secret word (check the "N letters" label at the top of the
board), a word not in the list, or a word that's already been guessed this
round — the viewer just needs to try something else.

**A round has an unusually hard word (very long words especially).**
Words of 15+ letters are genuinely tough. Use **Skip Round** or **Reveal
Answer**, or narrow the Word length range in Host Controls → Game.

**The secret-word list has a word I don't like / is missing one.**
Edit `words.json` on GitHub (see "Customizing the game"). The built-in list
already leaves out profanity, slurs, sexual terms, drugs, alcohol, and violence.
The very long words (11+ letters) were assembled from everyday roots and
suffixes, so a few may be unusual; delete any you don't want.

**The page looks fine but nothing updates.**
Refresh the page once. The browser reconnects to the server automatically,
but a hard refresh never hurts.

**A round is dragging on too long.**
Host Controls → Game → **Reveal Answer** (or **Skip Round**) ends it right
away; the next round starts automatically a few seconds later.

**Someone else opened Host Controls and I didn't want them to.**
There's no password gate on this build — the gear icon is open to anyone
with the page URL. Keep the link private (don't post it in your stream
description or bio) if that matters to you.

**Render says "Application failed to respond."**
Open the Logs tab on Render and look for a red error line — usually a typo
in an environment variable, or the build still in progress. Give it a
couple of minutes on first deploy.

Enjoy the stream! 🎉
