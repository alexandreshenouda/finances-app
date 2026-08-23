// REPL driver for finances-app (Expo web build). Run against an already-started Expo
// web dev server (see SKILL.md for how to start one). Designed for agents: launch
// under tmux, send-keys commands, capture-pane the output.
//
// Playwright is NOT a project dependency here — it's installed globally
// (/usr/lib/node_modules/playwright). Hence the CJS default-import workaround below
// instead of `import { chromium } from 'playwright'`.
import pkg from '/usr/lib/node_modules/playwright/index.js';
const { chromium } = pkg;
import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';

const SHOT_DIR = process.env.SCREENSHOT_DIR || '/tmp/finances-app-shots';
fs.mkdirSync(SHOT_DIR, { recursive: true });

const BASE_URL = process.env.APP_URL || 'http://localhost:8090';

let browser = null;
let page = null;

const COMMANDS = {
  async launch() {
    if (browser) return console.log('already launched');
    browser = await chromium.launch({ args: ['--no-sandbox'] }); // --no-sandbox: required in this container
    page = await browser.newPage({ viewport: { width: 500, height: 900 } }); // ~phone width; most screens are ScrollViews
    page.on('pageerror', (err) => console.log('[pageerror]', err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log('[console.error]', msg.text());
    });
    await page.goto(BASE_URL);
    await page.waitForTimeout(1500);
    console.log('launched at', BASE_URL);
  },

  // Expo Router serves every route directly by URL on web — no need to tap through
  // tabs. e.g. `goto /objective-form` or `goto /loan-form?loanId=abc123`.
  async goto(route) {
    if (!page) return console.log('ERROR: launch first');
    await page.goto(BASE_URL + route);
    await page.waitForTimeout(1000);
    console.log('goto', route, '→', page.url());
  },

  async ss(name) {
    if (!page) return console.log('ERROR: launch first');
    const f = path.join(SHOT_DIR, (name || `ss-${Date.now()}`) + '.png');
    await page.screenshot({ path: f });
    console.log('screenshot:', f);
  },

  async click(sel) {
    if (!page) return console.log('ERROR: launch first');
    const r = await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return 'NOT_FOUND';
      el.click();
      return 'OK';
    }, sel);
    console.log('click', sel, '→', r);
  },

  async 'click-text'(text) {
    if (!page) return console.log('ERROR: launch first');
    const r = await page.evaluate((t) => {
      const els = [...document.querySelectorAll('div, span, button, a')].filter((e) => e.children.length === 0);
      const el = els.find((e) => e.textContent?.trim() === t) ?? els.find((e) => e.textContent?.includes(t));
      if (!el) return 'NOT_FOUND';
      el.click();
      return 'OK';
    }, text);
    console.log('click-text', JSON.stringify(text), '→', r);
  },

  // React Native primitives (View/Pressable) aren't real form elements — no reliable
  // CSS selectors or `.value` to read/write for custom controls like sliders. Drag by
  // raw pixel coordinates instead. Use `at`/`box` first to find them.
  async drag(args) {
    if (!page) return console.log('ERROR: launch first');
    const [x1, y1, x2, y2] = args.split(/\s+/).map(Number);
    await page.mouse.move(x1, y1);
    await page.mouse.down();
    await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 5 });
    await page.mouse.move(x2, y2, { steps: 5 });
    await page.mouse.up();
    console.log(`drag (${x1},${y1}) → (${x2},${y2})`);
  },

  async 'click-at'(args) {
    if (!page) return console.log('ERROR: launch first');
    const [x, y] = args.split(/\s+/).map(Number);
    await page.mouse.click(x, y);
    console.log(`click-at (${x},${y})`);
  },

  // What DOM node sits at (x,y)? Use before scripting a `drag`/`click-at` on a custom
  // component to find the right coordinates.
  async at(args) {
    if (!page) return console.log('ERROR: launch first');
    const [x, y] = args.split(/\s+/).map(Number);
    const info = await page.evaluate(
      ([px, py]) => {
        const el = document.elementFromPoint(px, py);
        return el ? { tag: el.tagName, class: el.className, text: el.textContent?.slice(0, 60) } : null;
      },
      [x, y]
    );
    console.log('at', x, y, '→', JSON.stringify(info));
  },

  // Bounding box of the first element containing `text` — anchor point for
  // computing drag/click coordinates near a label (e.g. a slider under its title).
  async box(text) {
    if (!page) return console.log('ERROR: launch first');
    const box = await page
      .locator(`text=${text}`)
      .first()
      .boundingBox()
      .catch(() => null);
    console.log('box', JSON.stringify(text), '→', JSON.stringify(box));
  },

  async type(text) {
    if (page) await page.keyboard.type(text, { delay: 30 });
  },
  async press(key) {
    if (page) await page.keyboard.press(key);
  },

  async text() {
    if (!page) return console.log('ERROR: launch first');
    console.log(await page.evaluate(() => document.body.innerText));
  },

  async quit() {
    if (browser) await browser.close().catch(() => {});
    browser = null;
    page = null;
  },
  help() {
    console.log('commands:', Object.keys(COMMANDS).join(', '));
  },
};

// Stop the app stealing stdin; use the raw fd.
const stdin = fs.createReadStream(null, { fd: fs.openSync('/dev/stdin', 'r') });
const rl = readline.createInterface({ input: stdin, output: process.stdout, prompt: 'driver> ' });

// readline fires 'line' for every buffered line as soon as it's available — it does
// NOT wait for an async listener to resolve before firing the next one. Piping a
// whole heredoc of commands in one go (the non-tmux way of driving this) would
// otherwise run every command concurrently against the same `page`. Queue instead,
// and keep a handle on the in-flight drain so 'close' (heredoc EOF) can await it
// instead of exiting mid-command — 'close' fires as soon as the pipe is closed,
// which is almost immediately for a heredoc, well before an async command finishes.
const queue = [];
let drainingPromise = null;
// readline auto-closes its interface as soon as the input stream ends (immediate for
// a heredoc, long before an in-flight async command finishes) — calling rl.prompt()
// after that throws ERR_USE_AFTER_CLOSE. Guard every prompt with this instead.
let closed = false;
const safePrompt = () => {
  if (!closed) rl.prompt();
};

function drain() {
  if (!drainingPromise) {
    drainingPromise = (async () => {
      while (queue.length) {
        const line = queue.shift();
        const [cmd, ...rest] = line.trim().split(/\s+/);
        if (!cmd) {
          safePrompt();
          continue;
        }
        const fn = COMMANDS[cmd];
        if (!fn) {
          console.log('unknown:', cmd, '— try: help');
          safePrompt();
          continue;
        }
        try {
          await fn(rest.join(' '));
        } catch (e) {
          console.log('ERROR:', e.message);
        }
        if (cmd === 'quit') {
          process.exit(0);
        }
        safePrompt();
      }
      drainingPromise = null;
    })();
  }
  return drainingPromise;
}

rl.on('line', (line) => {
  queue.push(line);
  drain();
});
rl.on('close', async () => {
  closed = true;
  await drain();
  await COMMANDS.quit();
  process.exit(0);
});

console.log('finances-app driver — "help" for commands, "launch" to start');
rl.prompt();
