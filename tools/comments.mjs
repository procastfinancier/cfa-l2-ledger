// Reads and resolves the ledger comments in the Google Sheet, from the PC, so Claude can work
// through them without copy-paste.
//
//   node tools/comments.mjs                        list open comments
//   node tools/comments.mjs all                    list every comment
//   node tools/comments.mjs resolve <id> "reply"   mark one resolved, with a reply shown on the page
//
// Needs .comments-sync.json in the repo root (gitignored): { "url": "<web app URL>", "key": "<passphrase>" }
import { readFileSync } from 'node:fs';

const cfgPath = new URL('../.comments-sync.json', import.meta.url);
let cfg;
try { cfg = JSON.parse(readFileSync(cfgPath, 'utf8')); } catch (e) {
  console.error('Missing .comments-sync.json in the repo root: { "url": "...", "key": "..." }');
  process.exit(1);
}

async function sync(comments = []) {
  const res = await fetch(cfg.url, {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ key: cfg.key, comments }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Sync failed');
  return data.comments;
}

const [cmd = 'open', id, ...rest] = process.argv.slice(2);
if (cmd === 'resolve') {
  if (!id) { console.error('Usage: node tools/comments.mjs resolve <id> "reply"'); process.exit(1); }
  const all = await sync();
  const c = all.find(x => x.id === id);
  if (!c) { console.error('No comment with id ' + id); process.exit(1); }
  await sync([{ id, status: 'resolved', reply: rest.join(' '), u: Math.max(Date.now(), c.u + 1) }]);
  console.log('Resolved ' + id);
} else {
  const all = (await sync()).filter(c => c.status !== 'deleted' && (cmd === 'all' || c.status === 'open'));
  if (!all.length) console.log('No ' + (cmd === 'all' ? '' : 'open ') + 'comments.');
  all.forEach(c => console.log(
    `[${c.status}] [${c.tag}] ${c.reading}${c.section ? ' › ' + c.section : ' (whole reading)'}\n` +
    `  topic ${c.topic} · id ${c.id} · ${new Date(+c.created).toISOString().slice(0, 10)}\n` +
    `  ${c.text.replace(/\n/g, '\n  ')}` + (c.reply ? `\n  reply: ${c.reply}` : '') + '\n'));
}
