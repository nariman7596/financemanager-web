# Working on this project from your Mac (VS Code + Claude Code + Docker)

How the tools fit together and the day-to-day loop. Read this once and the rest
is muscle memory.

## The tools and their jobs

| Tool | What it's for | Where you interact |
| --- | --- | --- |
| **VS Code** | Your editor — see and change files | The editor window |
| **Claude Code** | AI pair-programmer *inside* VS Code — reads/edits files, runs commands, commits (the same assistant you're talking to now, running locally) | A terminal, or the Claude Code side panel |
| **Docker Desktop** | Runs Postgres (and optionally the whole app) in containers | Runs in the background |
| **git + GitHub** | Version control; your code lives on GitHub, cloned to your Mac | Terminal, or Claude Code does it |

Key point: **you don't type commands into the code editor.** You *edit files* in
the editor, and you *run commands* in a **terminal**. In VS Code the terminal is
built in — open it with **Terminal → New Terminal** (or **Ctrl + `**). Claude
Code runs in that terminal (or its own panel) and operates on whatever repo
folder you have open.

## One-time setup

Open the macOS **Terminal** app (just for this install step) and run:

```bash
# 1. Homebrew (macOS package manager)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. The apps + CLIs
brew install --cask visual-studio-code docker   # editor + Docker Desktop
brew install node git gh                          # Node.js, git, GitHub CLI

# 3. Start Docker Desktop once (from Applications) so its engine is running.

# 4. Claude Code (the CLI)
npm install -g @anthropic-ai/claude-code

# 5. Sign in to GitHub (for push / pull / PRs)
gh auth login          # choose GitHub.com → HTTPS → login in browser
```

In VS Code, optionally install the **Claude Code** extension (Extensions panel →
search "Claude Code") for an in-editor chat panel. The CLI alone also works fine.

## Connect Claude Code to your repo

"Connecting" just means: clone the repo, open the folder, run Claude Code there.
Claude Code is always scoped to the folder you open.

```bash
git clone https://github.com/nariman7596/financemanager.git
cd financemanager
code .            # opens this folder in VS Code
```

Then inside VS Code: open the terminal (**Ctrl + `**) and run:

```bash
claude            # starts Claude Code in this repo; first run asks you to log in
```

Now you can ask it to make changes — it edits files in the repo, runs commands,
and (if you ask) commits and pushes. Working on a **different** project? Open
that project's folder in a **separate VS Code window** and run `claude` there —
each window/terminal is scoped to its own repo.

## The daily loop

1. Open the project in VS Code (`code .` from its folder, or File → Open).
2. Start the local database:
   ```bash
   docker compose -f docker-compose.dev.yml up -d
   ```
3. First time only: `npm install`, `cp .env.example .env`, `npm run db:push`,
   `npm run db:seed` (optional).
4. Run the app with hot-reload:
   ```bash
   npm run dev            # http://localhost:3000
   ```
5. Edit — by hand in the editor, or by asking **Claude Code** in the terminal /
   panel. Changes hot-reload in the browser.
6. Save your work to GitHub (ask Claude Code, or do it yourself):
   ```bash
   git add -A && git commit -m "what changed" && git push
   ```
7. Deploy to the VPS (see `docs/DOCKER.md`): on the server,
   `git pull && docker compose up -d --build`.

## Tips

- **Two terminals** help: one running `npm run dev` (leave it going), one for
  Claude Code / git. Click the `+` in VS Code's terminal panel for a second one.
- **Stop the local DB** when done for the day: `docker compose -f docker-compose.dev.yml down`
  (your data stays in the volume).
- **Claude Code can drive Docker and git for you** — e.g. "start the dev
  database and run the app", or "commit and push these changes" — so you rarely
  type the commands yourself.
- Claude Code docs: https://docs.claude.com/en/docs/claude-code
