# Symble Live — TikTok LIVE Word Guessing Game

A fully automated version of **Symble** that reads your TikTok LIVE chat in
real time. Viewers work together to crack a secret 5-letter word using a board
of guesses and a column of mystery symbols. The fastest viewer to type the
secret word wins the round, and a Top 10 leaderboard tracks everyone across
the whole stream.

There is **no host password**. The gear icon opens Host Controls for anyone
with the page open — see "A note on Host Controls" below.

This guide assumes **zero coding experience**. Follow it top to bottom in
order. It should take about 20–30 minutes the first time.

---

## How the game works

**The rules of Symble**

- Every round has a secret 5-letter word and **3 random symbols**. Each symbol
  secretly means one thing, and nobody is told which:
  - *right spot* — that letter is in the guess, in the same position
  - *wrong spot* — that letter is in the guess, but somewhere else
  - *not in your guess* — that letter isn't in the guess
- Every guess on the board gets a row of **5 symbols** beside it. The catch:
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

- Any real 5-letter word a viewer types is a **vote for the next row**. Each
  viewer has one vote per row (typing another word changes their vote).
- When the row timer runs out (20 seconds by default), the most-voted word
  is locked into the board and its 5 symbols appear. Everyone who voted for it
  earns a few points.
- **Anyone who types the secret word wins the round instantly.** They don't
  need to win a vote, so once a viewer has worked it out, they should type it!
- When the board is full (8 rows), there's a short "last chance" window, then
  the answer is revealed. If nobody solves it, nobody scores and the next
  round starts a few seconds later.
- Chat that isn't a single 5-letter word (like "lol" or "omg so hard") is
  ignored by the game. Viewers can also type `!guess crane` if they prefer.

---

## What you're getting (the files)

```
symble-live-game/
├── server.js            <- the "brain": connects to TikTok, runs the game
├── gameEngine.js         <- the Symble rules: symbols, votes, rows, scoring
├── words.json             <- the secret words (880+ everyday 5-letter words)
├── guesses.json           <- every other word viewers are allowed to guess (6,500+)
├── package.json           <- tells the server what software it needs
├── .env.example            <- template for your settings
├── .gitignore
├── README.md              <- this file
└── public/
    └── index.html           <- everything you see on screen (no password needed)
```

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
3. Name it `symble-live-game`, keep it **Public** or **Private** (either
   works), leave everything else unchecked, and click **Create repository**.
4. On the next page, click **"uploading an existing file"**.
5. Drag in **all the files and folders** from Step 2 (yes, you can drag the
   whole `symble-live-game` folder contents in one go, including the
   `public` sub-folder — GitHub keeps the folder structure).
6. Scroll down and click **Commit changes**.

You now have a GitHub repository Render can deploy from.

---

## Step 4 — Deploy to Render.com

1. Go to **https://render.com** and sign up (free) — the easiest way is
   "Sign up with GitHub," which also connects your account automatically.
2. From the Render dashboard, click **New +** → **Web Service**.
3. Choose **Build and deploy from a Git repository**, then select the
   `symble-live-game` repo you just created. (If you don't see it, click
   "Configure account" and give Render access to that repo.)
4. Fill in the settings:
   - **Name**: anything you like, e.g. `symble-live`
   - **Region**: pick the one closest to you
   - **Branch**: `main`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free is fine to start
5. Scroll to **Environment Variables** and add these (click "Add Environment
   Variable" for each) — both are optional:

   | Key | Value |
   |---|---|
   | `SIGN_API_KEY` | paste your Euler Stream key from Step 1 (optional — you can also paste it directly in the app instead) |
   | `DEFAULT_TIKTOK_USERNAME` | your TikTok username without the @ (optional) |

6. Click **Create Web Service**. Render will install everything and start
   the server — this takes 2–5 minutes the first time. Watch the "Logs" tab;
   when you see `Symble Live server running on port ...` it's ready.
7. At the top of the page, Render shows your live URL, something like
   `https://symble-live.onrender.com`. Open it — that's your game!

> **Note on the free tier:** Render's free web services "spin down" after
> 15 minutes of no traffic and take ~30–60 seconds to wake back up on the
> next visit. Open the page a minute or two before you go live to warm it
> up. If this matters to you, Render's cheapest paid tier removes the
> spin-down.

---

## Step 5 — Open the game and open Host Controls

1. On your phone (or computer), open your Render URL.
2. Tap the **⚙️ gear icon** in the top-right corner. A panel slides up with
   tabs: **Connect / Game / Message / Add Word / Status**. There's nothing to
   unlock — it opens straight away.

> **A note on Host Controls:** anyone who opens your game's URL can tap the
> gear icon and use these controls (start/stop the game, connect to a
> different TikTok account, etc.). Only share the link with people you
> trust, and keep the page open on your own device/stream capture rather
> than posting the URL publicly.

---

## Step 6 — Test everything without going LIVE

You don't need to be live on TikTok to try this out:

1. Open the **Status** tab and flip the "Simulate fake TikTok chat" switch
   **on**. Fake viewers will start voting for words in the chat feed every
   second or so, and every so often one of them will "solve" the puzzle.
2. Open the **Game** tab and tap **▶ Start Game**.
3. Watch the board: the crowd's top-voted words appear under the timer, each
   row locks in with its 5 symbols when the timer runs out, and when a round
   ends the tiles flip to their colours and the answer and symbol meanings
   are revealed.
4. You can also type guesses yourself in the **Message** tab. A valid 5-letter
   word is a vote, and the secret word wins the round.
5. The **Status** tab also shows live diagnostics — a counter of every
   message received and the last one — so you always know things are
   working even without checking server logs.

When you're happy, turn Test Mode back **off**.

---

## Step 7 — Go live on TikTok

1. Start your TikTok LIVE stream from your phone as normal.
2. Back in the game page, open **Host Controls → Connect**.
3. Enter your **TikTok username** (no @) and your **Euler Stream API key**
   (skip the key field if you already set `SIGN_API_KEY` on Render).
4. Tap **Connect to LIVE**. The status dot at the top turns green once
   connected. The game will automatically retry the connection up to 3
   times if it fails before showing an error.
5. Go to **Game → ▶ Start Game**. Real TikTok comments now flow directly
   into the game — no further setup needed.
6. Share your screen (or point your camera at your phone) so your viewers
   can see the board while they type answers in your normal TikTok chat.
   A good pinned comment: *"Type a 5-letter word to vote. Type the secret
   word to win!"*

---

## Customizing the game

- **Pacing**: Host Controls → **Game → Pacing**.
  - *Seconds per row* — how long the crowd has to vote for each row (default 20).
  - *Last-chance seconds* — how long viewers can still solve it after the last
    row (default 20).
  - *Rows on the board* — 5 to 10 (default 8, like the original Symble). This
    applies from the next round; the timers apply straight away.
  - *Max round seconds* — a hard cap for a whole round (default 300).
- **Add secret words**: Host Controls → **Add Word**. Type any 5-letter word and
  tap **Add to Word Bank**. It can come up as a secret word from then on.
  Render's free tier wipes files whenever it redeploys, so to keep a word
  forever, add it to `words.json` on GitHub as well (see next point).
- **Change the built-in words**: open `words.json` on GitHub, click the pencil
  (✏️) icon to edit, and add or remove words. Each one is 5 capital letters in
  quotes, followed by a comma (except the last one). Commit, then redeploy in
  Render (Manual Deploy → Deploy latest commit). `guesses.json` works the same
  way; it's the list of extra words viewers may vote for. Anything in
  `words.json` is also accepted as a guess automatically.
- **Scoring**: see below.

---

## Troubleshooting

**"Diagnostics" shows 0 raw events during a live stream.**
Your comments aren't reaching the server. Double-check: (a) you are
actually LIVE on TikTok, (b) the username you typed matches your TikTok
handle exactly, (c) the status dot is green/"Connected."

**Status shows "error" after 3 attempts.**
Usually means either the username is wrong, you're not currently live, or
the Euler Stream key is missing/invalid. Re-check Step 7 and try again —
the game always retries automatically before giving up.

**A viewer's guess did nothing.**
The chat shows a small tag next to each guess. "vote" means it counted;
"not a word" means it's not in the word list; "already played" means that
word is already on the board; "board full" means you're in the last-chance
window (only the secret word counts now). Guesses must be a single 5-letter
word with no other text.

**The page looks fine but nothing updates.**
Refresh the page once. The browser reconnects to the server automatically,
but a hard refresh never hurts.

**I want to reset everyone's scores.**
Host Controls → Game → **Reset Leaderboard**.

**Someone else opened Host Controls and I didn't want them to.**
There's no password gate on this build — the gear icon is open to anyone
with the page URL. Keep the link private (don't post it in your stream
description or bio) if that matters to you.

**Render says "Application failed to respond."**
Open the Logs tab on Render and look for a red error line — usually a typo
in an environment variable, or the build still in progress. Give it a
couple of minutes on first deploy.

---

## How the scoring works (for the curious)

- **Solving the round** (typing the secret word): `100` points, plus `20` for
  every row still empty on the board, plus up to `60` more for time left on
  the round clock. Solving it with an empty board is worth about 320; solving
  it after the board is full is worth about 160. The board shows the current value.
- **Voting**: everyone who voted for the word that got locked into a row
  earns `5` points.
- Only the first person to type the secret word scores the round; the round
  ends immediately.
- If nobody solves it, nobody scores for the solve and the answer is revealed.

Enjoy the stream! 🎉
