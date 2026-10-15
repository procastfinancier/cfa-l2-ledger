// Checks that the page will actually load: the inline script compiles, the data at the top of it
// evaluates, every block kind has a renderer, and every diagram edge joins two real nodes. A script
// syntax error stops the whole page at "loading…", so the pre-commit hook runs this on the *staged*
// copy of index.html (what will really be pushed), and the GitHub check runs it on every push.
//
//   node tools/page-check.mjs                 # the working copy
//   node tools/page-check.mjs some/file.html  # any copy, e.g. the staged one the hook writes out
//   node tools/page-check.mjs --live          # after a push: waits for GitHub Pages to serve HEAD, then checks it
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIVE = 'https://procastfinancier.github.io/cfa-l2-ledger/';
const arg = process.argv[2];

function check(html, label) {
  const problems = [];
  const open = html.indexOf('<script>'), close = html.lastIndexOf('</script>');
  if (open < 0 || close < 0) return [`${label}: no inline <script> found`];
  const js = html.slice(open + 8, close);

  try { new vm.Script(js, { filename: label, lineOffset: html.slice(0, open).split('\n').length - 1 }); } catch (e) {
    return [`${label}: script does not compile — ${e.message} (at ${e.stack.split('\n')[0]})`];
  }

  const curvePts = (fn, a, z, n) => { const p = []; for (let i = 0; i <= (n || 40); i++) { const x = a + (z - a) * i / (n || 40); p.push([x, fn(x)]); } return p; };
  let CONTENT;
  try {
    ({ CONTENT } = new Function('curvePts', js.slice(0, js.indexOf('let selectedKey')) + '; return { CONTENT };')(curvePts));
  } catch (e) { return [`${label}: data section throws — ${e.message}`]; }

  const kinds = new Set([...js.matchAll(/case '([a-z]+)':/g)].map(m => m[1]));
  for (const [key, c] of Object.entries(CONTENT)) {
    for (const s of c.flow || []) {
      for (const b of s.blocks || []) {
        const where = `${key} ${s.module}${b.id ? ' #' + b.id : ''}`;
        if (!b || typeof b.k !== 'string') { problems.push(`${where}: block without a kind`); continue; }
        if (!kinds.has(b.k)) problems.push(`${where}: unknown block kind '${b.k}'`);
        if (b.k === 'graph') {
          const ids = new Set((b.nodes || []).map(n => n.id));
          (b.edges || []).forEach(e => { if (!ids.has(e.from) || !ids.has(e.to)) problems.push(`${where}: edge ${e.from} → ${e.to} names a missing node`); });
        }
        if (b.k === 'plot') (b.series || []).forEach((sr, i) => {
          if (!Array.isArray(sr.pts) || sr.pts.some(p => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) problems.push(`${where}: series ${i} has a bad point`);
        });
      }
    }
  }
  return problems;
}

function report(problems, label) {
  if (problems.length) {
    console.log(`${label}: ${problems.length} problem(s) — the page may not load:`);
    problems.forEach(p => console.log('  - ' + p));
    process.exit(1);
  }
  console.log(`${label}: script compiles, data evaluates, every block has a renderer.`);
}

if (arg === '--live') {
  const head = execSync('git show HEAD:index.html', { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 }).replace(/\r\n/g, '\n');
  let html = '';
  for (let i = 0; i < 40; i++) {
    html = (await (await fetch(LIVE + '?nc=' + Date.now(), { cache: 'no-store' })).text()).replace(/\r\n/g, '\n');
    if (html === head) break;
    if (i === 0) console.log('Waiting for GitHub Pages to serve HEAD…');
    await new Promise(r => setTimeout(r, 15000));
  }
  if (html !== head) { console.log('Live page still differs from HEAD after 10 minutes — check the Pages deploy on GitHub.'); process.exit(1); }
  report(check(html, 'live page'), 'live page (matches HEAD)');
} else {
  const file = arg ? path.resolve(arg) : path.join(root, 'index.html');
  report(check(fs.readFileSync(file, 'utf8'), path.basename(file)), arg ? file : 'index.html');
}
