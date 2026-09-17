# Symble Live — TikTok LIVE Word Guessing Game

A fully automated word-guessing game that reads your TikTok LIVE chat in real
time. Viewers see a category, a difficulty rating, and an **emoji/symbol
clue** (e.g. 🍕🌙 = "PIZZA NIGHT"), then race to type the answer in your chat.
The fastest correct guesser wins points; a Top 10 leaderboard tracks
everyone across the whole stream.

This guide assumes **zero coding experience**. Follow it top to bottom in
order. It should take about 20–30 minutes the first time.

---

## What you're getting (the files)

```
symble-live-game/
├── server.js            <- the "brain": connects to TikTok, runs the game
├── gameEngine.js         <- scoring, hints, rounds (used by server.js)
├── words.json             <- the built-in bank of ~45 emoji puzzles
├── package.json           <- tells the server what software it needs
├── .env.example            <- template for your secret settings
├── .gitignore
├── README.md              <- this file
└── public/
    └── index.html           <- everything you see on screen
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
   Variable" for each):

   | Key | Value |
   |---|---|
   | `HOST_PASSWORD` | choose your own password, e.g. `MySecret123` |
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

## Step 5 — Open the game and unlock Host Controls

1. On your phone (or computer), open your Render URL.
2. Scroll to the bottom and tap **🛠️ Host Controls**.
3. Enter the `HOST_PASSWORD` you set in Step 4 and tap **Unlock**.
4. You'll now see tabs: **Connect / Game / Message / Add Word / Test Mode**.

---

## Step 6 — Test everything without going LIVE

You don't need to be live on TikTok to try this out:

1. Open the **Test Mode** tab and flip the switch **on**. Fake viewer
   messages will start appearing in the chat feed every couple of seconds,
   and every so often one will "guess" the correct answer.
2. Open the **Game** tab and tap **▶ Start Game**.
3. Watch the board: the emoji clue appears, letters start revealing over
   time, and the timer bar counts down. When Test Mode gets the right
   answer (or you type it yourself in the **Message** tab), you'll see the
   reveal banner and the leaderboard update.
4. Check the **Diagnostics** button (top right) — it shows a live counter of
   every message received and the last one, so you always know things are
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

---

## Customizing the game

- **Add new puzzles**: Host Controls → **Add Word**. Type the answer, paste
  emoji(s), pick a category and difficulty, and tap **Add to Word Bank**.
  These are saved permanently on the server (in `words-custom.json`) and
  will keep showing up in future rounds, even after a restart.
- **Change the built-in puzzles**: open `words.json` on GitHub, click the
  pencil (✏️) icon to edit, adjust the list following the existing format,
  and commit. Render will need to be redeployed to pick up file edits made
  outside the Add Word form (Render → Manual Deploy → Deploy latest commit).
- **Change the password**: update `HOST_PASSWORD` in Render's Environment
  tab and click **Save, rebuild, and deploy**.
- **Scoring/difficulty logic**: harder words (difficulty 3) are worth more
  points and run on a longer timer; points shrink the longer a round runs
  and each time a letter hint is auto-revealed. This is all handled
  automatically — no need to touch anything.

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

**The page looks fine but nothing updates.**
Refresh the page once. The browser reconnects to the server automatically,
but a hard refresh never hurts.

**I want to reset everyone's scores.**
Host Controls → Game → **Reset Leaderboard**.

**Render says "Application failed to respond."**
Open the Logs tab on Render and look for a red error line — usually a typo
in an environment variable, or the build still in progress. Give it a
couple of minutes on first deploy.

---

## How the scoring works (for the curious)

- Every puzzle has a difficulty from 1 (easy) to 3 (hard), set per word.
- Round length: 55–85 seconds depending on difficulty.
- Starting value: `60 + (difficulty × 40)` points.
- Every full second that passes, the value drops by 2 points.
- Every time a letter is auto-revealed as a hint, the value drops by 15
  points (never below a 10-point floor).
- The first person to type a correct answer (small typos are forgiven on
  longer answers) wins that round's current point value and the round ends
  immediately.
- If nobody guesses in time, the answer is revealed, nobody scores, and the
  next round starts a few seconds later.

Enjoy the stream! 🎉
