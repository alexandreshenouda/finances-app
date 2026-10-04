// Génère les badges « tests » et « couverture » du README au format endpoint de shields.io
// (https://shields.io/badges/endpoint-badge), à partir des rapports Vitest :
//   coverage/test-results.json     — reporter `json` (`--outputFile.json=…`)
//   coverage/coverage-summary.json — reporter de couverture `json-summary` (vitest.config.mts)
// Usage : node .github/scripts/make-badges.mjs <dossier-rapports> <dossier-sortie>
// Échoue bruyamment si un rapport manque : mieux vaut un job rouge qu'un badge figé.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [reportsDir = 'coverage', outDir = 'badges'] = process.argv.slice(2);
const read = (f) => JSON.parse(readFileSync(join(reportsDir, f), 'utf8'));

const fmt = (pct) => `${Number.isInteger(pct) ? pct : pct.toFixed(1)} %`;
// Vert = vert « gain » de la palette de l'app, comme les autres badges du README.
const color = (pct, [good, ok, meh]) =>
  pct >= good ? '34D399' : pct >= ok ? 'yellowgreen' : pct >= meh ? 'orange' : 'red';

const results = read('test-results.json');
const total = results.numTotalTests - results.numPendingTests - results.numTodoTests;
const passed = results.numPassedTests;
const passPct = total > 0 ? (passed / total) * 100 : 0;

const coverage = read('coverage-summary.json').total.lines.pct;

const badges = {
  'tests.json': {
    label: 'tests',
    message: `${fmt(passPct)} (${passed}/${total})`,
    color: passed === total && total > 0 ? '34D399' : color(passPct, [101, 95, 80]),
  },
  'coverage.json': {
    label: 'couverture',
    message: fmt(coverage),
    color: color(coverage, [80, 60, 40]),
  },
};

mkdirSync(outDir, { recursive: true });
for (const [file, badge] of Object.entries(badges)) {
  writeFileSync(join(outDir, file), JSON.stringify({ schemaVersion: 1, ...badge }) + '\n');
  console.log(`${file}: ${badge.label} → ${badge.message}`);
}
