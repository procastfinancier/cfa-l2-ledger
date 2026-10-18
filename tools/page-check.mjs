// Checks that the page will actually load: the inline script compiles, the data at the top of it
// evaluates, every block kind has a renderer, and every diagram edge joins two real nodes. A script
// syntax error stops the whole page at "loading…", so the pre-commit hook runs this on the *staged*
// copy of index.html (what will really be pushed), and the GitHub check runs it on every push.
//
// Then a load test opens the page in headless Chrome the way I do, with nothing injected but a probe:
// startup must finish with no uncaught error (the sidebar, stats and countdown all drawn), and every
// reading, exam view, the test log and the daily plan must then render without throwing. Static checks
// can't see an error that only happens at runtime, like reading a const before it is declared. Without
// Chrome the load test is skipped with a warning, except on GitHub (CI set), where it is required.
//
//   node tools/page-check.mjs                 # the working copy
//   node tools/page-check.mjs some/file.html  # any copy, e.g. the staged one the hook writes out
//   node tools/page-check.mjs --live          # after a push: waits for GitHub Pages to serve HEAD, then checks it
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import os from 'os';
import { execSync, execFileSync } from 'child_process';
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

  // The first top-level render() draws the page at load. A top-level const or let declared below it doesn't
  // exist yet at that moment, so reading it throws and the page stops half-drawn.
  const first = js.search(/\nrender\(\);/);
  if (first >= 0) {
    const late = [...js.slice(first).matchAll(/\n(?:const|let) ([A-Za-z_$][\w$]*)/g)].map(m => m[1]);
    if (late.length) return [`${label}: top-level ${late.slice(0, 5).join(', ')}${late.length > 5 ? '…' : ''} declared after the first render() — move them above it`];
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

function findChrome() {
  const c = [process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return c.find(f => f && fs.existsSync(f)) || null;
}

// The probe goes in first, so it hears errors from the page's own script; the report runs after startup,
// then visits every view and reading, collecting anything that throws.
const PROBE = `<script id="loadProbe">window.__errs=[];addEventListener('error',e=>__errs.push(String(e.message)+(e.lineno?' (line '+e.lineno+')':'')));addEventListener('unhandledrejection',e=>__errs.push('promise: '+String(e.reason)));</script>`;
const REPORT = `<script id="loadReport">setTimeout(()=>{const r={errs:__errs.slice(),subj:document.querySelectorAll('#sidebarList .subj').length,
stats:(document.getElementById('stats')||{}).textContent||'',bar:(document.getElementById('cdBar')||{}).textContent||'',views:[]};
try{const ks=['plan','tests'].concat(Object.keys(EX_VIEWS),FLAT.map(t=>t.key));ks.forEach(k=>{const n=__errs.length;try{selectedKey=k;render();}catch(e){__errs.push(String(e.message));}
if(__errs.length>n)r.views.push(k+': '+__errs.slice(n).join('; '));});}catch(e){r.views.push('view sweep: '+e.message);}
const p=document.createElement('pre');p.id='__load';p.textContent=JSON.stringify(r);document.body.appendChild(p);},800);</script>`;

function loadTest(html, label) {
  const chrome = findChrome();
  if (!chrome) {
    if (process.env.CI) return [`${label}: no Chrome to run the load test`];
    console.log(`${label}: warning — no Chrome found, load test skipped (set CHROME_PATH)`);
    return [];
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-load-')), file = path.join(dir, 'page.html');
  try {
    const i = html.indexOf('<head>');
    let page = i < 0 ? PROBE + html : html.slice(0, i + 6) + PROBE + html.slice(i + 6);
    page = page.replace(/<\/body>(?![\s\S]*<\/body>)/, REPORT + '</body>');
    fs.writeFileSync(file, page);
    const args = ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + path.join(dir, 'profile'),
      '--virtual-time-budget=8000', '--dump-dom', 'file:///' + file.split(path.sep).join('/')];
    if (process.platform === 'linux') args.unshift('--no-sandbox');
    const dom = execFileSync(chrome, args, { encoding: 'utf8', maxBuffer: 256 << 20, timeout: 120000, stdio: ['ignore', 'pipe', 'ignore'] });
    const m = /<pre id="__load">([\s\S]*?)<\/pre>/.exec(dom);
    if (!m) return [`${label}: load test — the page never finished starting up (no report)`];
    const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
    const problems = [...new Set(r.errs)].map(e => `${label}: error while the page loads — ${e}`);
    if (!r.subj) problems.push(`${label}: the sidebar drew no subjects at load`);
    if (/loading/i.test(r.stats)) problems.push(`${label}: the stats line is still "loading…" after startup`);
    if (!r.bar.trim()) problems.push(`${label}: the countdown bar is empty after startup`);
    const byErr = {};
    r.views.forEach(v => { const i = v.indexOf(': '); (byErr[v.slice(i + 2)] = byErr[v.slice(i + 2)] || []).push(v.slice(0, i)); });
    Object.keys(byErr).forEach(e => { const ks = byErr[e];
      problems.push(`${label}: error when opening ${ks.length > 3 ? ks.length + ' views (' + ks.slice(0, 3).join(', ') + '…)' : ks.join(', ')} — ${e}`); });
    return problems;
  } catch (e) {
    return [`${label}: load test could not run — ${e.message.split('\n')[0]}`];
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function report(problems, label) {
  if (problems.length) {
    console.log(`${label}: ${problems.length} problem(s) — the page may not load:`);
    problems.forEach(p => console.log('  - ' + p));
    process.exit(1);
  }
  console.log(`${label}: script compiles, data evaluates, every block has a renderer, and it loads in a browser.`);
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
  const p = check(html, 'live page');
  report(p.length ? p : loadTest(html, 'live page'), 'live page (matches HEAD)');
} else {
  const file = arg ? path.resolve(arg) : path.join(root, 'index.html');
  const html = fs.readFileSync(file, 'utf8'), p = check(html, path.basename(file));
  report(p.length ? p : loadTest(html, path.basename(file)), arg ? file : 'index.html');
}
