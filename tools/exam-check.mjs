// Checks the exam-day notes in index.html are in step with the readings: every reading has an
// overview and every session a summary and key points in EXAM, every EXAM session still exists,
// and every `find` phrase matches a block in its session, so each ↗ on the formula sheet and
// concise notes lands on the block it came from. The pre-commit hook and the GitHub check both run it:
//
//   node tools/exam-check.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const js = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
const data = js.slice(0, js.indexOf('let selectedKey'));
const curvePts = (fn, a, z, n) => { const p = []; for (let i = 0; i <= (n || 40); i++) { const x = a + (z - a) * i / (n || 40); p.push([x, fn(x)]); } return p; };
const { CONTENT, EXAM, FLAT } = new Function('curvePts', data + '; return { CONTENT, EXAM, FLAT };')(curvePts);

const plain = s => String(s || '').replace(/\*/g, '').toLowerCase();
const problems = [];
let lines = 0, formulas = 0;
for (const [topic, mods] of Object.entries(EXAM)) {
  const c = CONTENT[topic];
  if (!c) { problems.push(`${topic}: no such reading`); continue; }
  for (const [mod, e] of Object.entries(mods)) {
    if (mod === 'about') continue;
    const texts = c.flow
      ? ((c.flow.find(s => s.module === mod) || {}).blocks || []).map(b => plain(JSON.stringify(b)))
      : (c.notes || []).filter(n => n.type.indexOf(mod + ' ') === 0).map(n => plain(n.term + ' ' + n.a));
    if (!texts.length) { problems.push(`${topic} ${mod}: no such session`); continue; }
    const check = (find, what) => { if (find && !texts.some(t => t.includes(plain(find)))) problems.push(`${topic} ${mod}: "${find}" (${what}) matches no block`); };
    (e.n || []).forEach(n => { lines++; check(n[1], 'note'); });
    (e.f || []).forEach(f => { formulas++; check(f[2], 'formula ' + f[0]); });
  }
}
// Coverage: a reading needs its overview, and every session (including one just added) its
// summary and key points.
// Reading 7 has no sessions, so its points are grouped by their module prefix ("7.3 · …").
for (const [topic, c] of Object.entries(CONTENT)) {
  const name = (FLAT.find(t => t.key === topic) || {}).name || topic;
  const mods = c.flow ? c.flow.map(s => s.module)
    : [...new Set((c.notes || []).map(n => (/^(\d+\.[A-Za-z]*\d+)\s*·/.exec(n.type) || [])[1]).filter(Boolean))];
  if (!((EXAM[topic] || {}).about || []).length) problems.push(`${name}: no reading overview (EXAM about)`);
  mods.forEach(mod => {
    const e = (EXAM[topic] || {})[mod] || {};
    if (!(e.s || []).length) problems.push(`${name} ${mod}: no session summary (EXAM s)`);
    if (!(e.n || []).length) problems.push(`${name} ${mod}: no key points (EXAM n)`);
  });
}

console.log(`${lines} notes and ${formulas} extra formulas checked.`);
if (problems.length) {
  console.log(problems.join('\n'));
  console.log('\nThe exam sheet is out of step: write the missing EXAM lines or fix the `find` phrases above.');
  process.exit(1);
}
console.log('Every reading has an overview, every session a summary and key points, and every link lands on a block.');
