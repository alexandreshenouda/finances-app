---
name: run
description: Build, run, and drive the finances-app Expo web build. Use when asked to start the app, take a screenshot of it, or verify a UI change actually works (not just typechecks/bundles).
model: haiku
---

Expo Router app (React Native + web via `react-native-web`), driven for agent use
via a Playwright REPL at `.claude/skills/run/driver.mjs`. No `chromium-cli` on this
machine and no browser-testing framework in the project — the driver is a plain
Node script talking to the globally-installed `playwright` package directly.

Prefer this over "just typecheck/bundle and call it done" for any UI-visible change
(new screen, new component, styling, custom gesture/interaction) — see Gotchas below
for a real bug (a stale-closure slider) that `tsc` and `expo export` both passed
while completely broken at runtime.

**This skill runs on Haiku by default** — fine for the mechanical part (start the
server, run a documented command sequence, screenshot, confirm expected text/DOM
state). It is NOT the right tool for root-causing something that doesn't behave as
this doc says it should. If a command errors unexpectedly, a screenshot shows broken
UI, or an interaction doesn't produce the documented effect: **stop, do not attempt a
fix, and report back exactly what you ran and what you observed** (command, output,
screenshot path) so a stronger model can diagnose it. Guessing at a fix here is how
a wrong "fix" or a long blind retry loop ends up costing more than the tokens this
model choice was meant to save.

## Start the dev server

```bash
node_modules/.bin/expo start --web --port 8090 &   # NOT `npx expo` — the rtk shell hook
                                                    # rewrites npx to the wrong resolution
timeout 60 bash -c 'until curl -sf http://localhost:8090 >/dev/null; do sleep 1; done'
```

Metro can segfault on the very first bundle right after "Starting Metro Bundler" —
flaky env crash, not a code error. Just re-run.

**If you added/renamed a route file under `src/app/`**, `tsc` will report it as an
invalid `router.push` target — `expo export --platform web` does *not* regenerate
Expo Router's typed-routes file. Run the dev server with `--clear` once first so
`.expo/types/router.d.ts` picks up the new route before trusting a typecheck:

```bash
node_modules/.bin/expo start --clear --web --port 8090 &
timeout 20 bash -c 'until grep -q "your-new-route" .expo/types/router.d.ts 2>/dev/null; do sleep 1; done'
```

**Stop it precisely** — `pkill -f "expo start"` misses the wrapper/child pid split
(`sh -c expo start --web` spawns a separate node process) and leaves Metro running.
Use the port instead:

```bash
lsof -ti:8090 | xargs -r kill
ps aux | grep -i "expo\|metro" | grep -v grep   # confirm nothing lingers
```

## Drive it

**No `tmux` on this machine** — don't reach for the usual tmux REPL pattern. Pipe a
whole script of commands into the driver via a heredoc instead; it queues and runs
them one at a time (see Gotchas) and exits cleanly after the last line:

```bash
cd /home/alexandre/git/finances-app
APP_URL=http://localhost:8090 node .claude/skills/run/driver.mjs <<'EOF'
launch
goto /objective-form
box Durée de sécurité
ss form
quit
EOF
```

Screenshots land in `/tmp/finances-app-shots/` (override with `SCREENSHOT_DIR`). Then
actually open the PNG and look at it — a blank frame means the route didn't render.

If `tmux` ever is available and you want a persistent session to iterate in (faster
than relaunching the browser per script), the usual pattern applies: `tmux new-session
-d -s app`, `send-keys -t app '<cmd>' Enter`, `capture-pane -t app -p` to read output —
just skip the `<<EOF` piping in that case and type commands one at a time instead.

### Commands

| command | what it does |
|---|---|
| `launch` | open the browser, navigate to `$APP_URL` |
| `goto <route>` | navigate to an Expo Router path, e.g. `/loan-form?loanId=abc` |
| `ss [name]` | screenshot → `/tmp/finances-app-shots/<name>.png` |
| `click <css-sel>` | click via DOM `.click()` |
| `click-text <text>` | click the leaf element whose text matches/contains `<text>` |
| `click-at <x> <y>` / `drag <x1> <y1> <x2> <y2>` | raw pixel click/drag — for custom RN components, see Gotchas |
| `at <x> <y>` | `document.elementFromPoint(x,y)` — find what's at a coordinate before scripting a drag |
| `box <text>` | bounding box of the element containing `<text>` — anchor for computing coordinates |
| `type <text>` / `press <key>` | keyboard input |
| `text` | dump `document.body.innerText` |
| `quit` | close the browser |
| `help` | list commands |

## Gotchas

- **Playwright isn't a project dependency** — it's global
  (`/usr/lib/node_modules/playwright`). A plain `import { chromium } from 'playwright'`
  fails to resolve; the driver uses
  `import pkg from '/usr/lib/node_modules/playwright/index.js'; const { chromium } = pkg;`
  (default-export workaround because it's CJS). Launch with `args: ['--no-sandbox']`
  — required in this container.

- **React Native primitives aren't real form elements.** Custom components (the
  hand-built `Slider` in `src/components/ui.tsx`, hand-drawn SVG icons, etc.) have no
  meaningful CSS selector or `.value` — `click`/`fill` on a selector won't work on
  them. Use `at`/`box` to find pixel coordinates near a known text label, then
  `click-at`/`drag`. Read the resulting state back via `text` (scrape rendered text),
  not a form value.

- **This is exactly how a real bug got caught.** A custom `Slider` looked fine
  visually and passed `tsc`/`expo export`, but every click/drag silently did nothing:
  `PanResponder.create(...)` was wrapped in `useRef(...)`, so its closure captured
  `width` from the very first render (`0`, before layout) forever. Only driving it
  with real mouse events (`page.mouse.down/move/up`) surfaced it — reading the DOM
  or the component source did not. Don't skip this step for gesture/interaction code.

- **Chained multi-step mouse sequences in one script can hang** (observed: a 3rd
  sequential drag in one Node script never returned, no error). Keep each script
  focused on one interaction, run with a timeout, and prefer `run_in_background` +
  polling over blocking on a long combined script.

- **Cleanup:** always verify with `ps aux | grep -i "expo\|metro"` after killing —
  `pkill -f` pattern matches are unreliable against the `sh -c` wrapper Expo spawns
  under; killing by the port's listener (`lsof -ti:<port>`) is reliable.

## Run (human path)

```bash
npm run web    # opens the Expo web dev server interactively; Ctrl-C to quit
```
