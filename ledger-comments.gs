/**
 * Ledger comments: keeps the comments I leave on the ledger page (doubts, fixes, things to add)
 * and my revision progress (sessions revised, checkpoint grades and review dates) in this Google
 * Sheet, so every device sees the same state and Claude can read and resolve the comments.
 *
 * Setup (once):
 *   1. Make a new Google Sheet (e.g. "CFA Ledger Comments") and open Extensions > Apps Script.
 *   2. Paste this file in, change PASSPHRASE below to your own phrase and save.
 *   3. Run setup() once and allow access when Google asks.
 *   4. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone. Copy the URL.
 *   5. On the ledger page, open Comments > Sync settings, and enter the URL and the same
 *      passphrase. Do that once on each device.
 *   After any later change to this file: Deploy > Manage deployments > Edit > New version.
 *
 * Ask AI (optional): the page's 🤖 button sends questions through this script to Claude.
 *   1. Get an API key at console.anthropic.com (Settings > API keys) and add credit under Billing.
 *   2. Here, open Project Settings (gear icon) > Script properties > Add script property:
 *      name ANTHROPIC_API_KEY, value the key. Save.
 *   3. Deploy a new version (above). Google asks once more to allow external requests: allow it.
 *
 * Tab it keeps:
 *   Comments  one row per comment. You can edit Comment, Status (open / resolved) and Reply here;
 *             leave ID, Topic key and Updated alone.
 *   Progress  one row per session ticked as revised, per checkpoint question graded, and per ☆
 *             star on the exam-day set. Read-only: the page writes it.
 */
const PASSPHRASE = 'change-me';

const HEADERS = ['ID', 'Created', 'Topic key', 'Reading', 'Section', 'Tag', 'Comment', 'Status', 'Reply', 'Updated'];
const FIELDS = ['id', 'created', 'topic', 'reading', 'section', 'tag', 'text', 'status', 'reply', 'u'];
const P_HEADERS = ['Key', 'Reading', 'Session', 'Item', 'Value', 'Updated'];
const P_FIELDS = ['k', 'reading', 'session', 'item', 'v', 'u'];
const NAVY = '#1F3864';

function setup() {
  tab_();
  SpreadsheetApp.getActive().toast('Ledger comments is set up. Now deploy it as a web app.');
}

function tab_() {
  const ss = SpreadsheetApp.getActive();
  const make = (name, headers, widths, textCols) => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers])
        .setFontWeight('bold').setFontColor('#FFFFFF').setBackground(NAVY).setFontFamily('Arial');
      sh.setFrozenRows(1);
      widths.forEach((w, i) => sh.setColumnWidth(i + 1, w));
      // Stored as text so Sheets doesn't turn ids, timestamps or JSON into numbers or dates.
      textCols.forEach(c => sh.getRange(1, c, sh.getMaxRows(), 1).setNumberFormat('@'));
    }
    return sh;
  };
  const sh = make('Comments', HEADERS, [110, 130, 80, 220, 260, 80, 380, 80, 300, 110], [1, 2, 3]);
  const prog = make('Progress', P_HEADERS, [230, 220, 260, 380, 300, 110], [1, 5]);
  const blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
  return { sh, prog };
}

// Opening the web app URL in a browser shows this, which confirms the deployment works.
function doGet() {
  return json_({ ok: true, app: 'ledger-comments' });
}

// One request does both directions: the page sends the comments and progress rows it changed
// (newer copies replace older ones, field by field, so a request may carry only
// { id, status, reply, u }), and the reply carries every comment and progress row in the sheet.
function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'Bad request' }); }
  if (PASSPHRASE === 'change-me') return json_({ ok: false, error: 'Set PASSPHRASE in the script, then deploy a new version' });
  if (!req || req.key !== PASSPHRASE) return json_({ ok: false, error: 'Wrong passphrase' });
  if (req.ask) return json_(ask_(req.ask));

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const { sh, prog } = tab_();
    const last = sh.getLastRow();
    const rows = last > 1 ? sh.getRange(2, 1, last - 1, HEADERS.length).getValues() : [];
    const at = {};
    rows.forEach((r, i) => { at[String(r[0])] = i; });

    let changed = false;
    (req.comments || []).forEach(c => {
      if (!c || !/^c_[\w-]+$/.test(c.id || '')) return;
      const i = at[c.id];
      if (i != null && (+rows[i][9] || 0) >= (+c.u || 0)) return;
      const row = i != null ? rows[i].slice() : FIELDS.map(() => '');
      FIELDS.forEach((f, k) => { if (c[f] !== undefined) row[k] = f === 'u' ? (+c.u || Date.now()) : String(c[f]); });
      if (!row[7]) row[7] = 'open';
      if (i != null) rows[i] = row; else { at[c.id] = rows.length; rows.push(row); }
      changed = true;
    });
    if (changed) sh.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);

    const out = rows.filter(r => r[0]).map(r => {
      const o = {};
      FIELDS.forEach((f, k) => { o[f] = f === 'u' ? (+r[k] || 0) : String(r[k]); });
      return o;
    });

    const pLast = prog.getLastRow();
    const pRows = pLast > 1 ? prog.getRange(2, 1, pLast - 1, P_HEADERS.length).getValues() : [];
    const pAt = {};
    pRows.forEach((r, i) => { pAt[String(r[0])] = i; });
    let pChanged = false;
    (req.progress || []).forEach(p => {
      if (!p || !/^(rev|q|star)\|/.test(p.k || '')) return;
      const i = pAt[p.k];
      if (i != null && (+pRows[i][5] || 0) >= (+p.u || 0)) return;
      const row = P_FIELDS.map(f => f === 'u' ? (+p.u || Date.now()) : String(p[f] == null ? '' : p[f]));
      if (i != null) pRows[i] = row; else { pAt[p.k] = pRows.length; pRows.push(row); }
      pChanged = true;
    });
    if (pChanged) prog.getRange(2, 1, pRows.length, P_HEADERS.length).setValues(pRows);
    const pOut = pRows.filter(r => r[0]).map(r => {
      const o = {};
      P_FIELDS.forEach((f, k) => { o[f] = f === 'u' ? (+r[k] || 0) : String(r[k]); });
      return o;
    });
    return json_({ ok: true, comments: out, progress: pOut });
  } finally {
    lock.releaseLock();
  }
}

// A hand edit to Comment, Status or Reply in the sheet counts as the newest copy, so the page
// takes it on its next sync instead of overwriting it.
function onEdit(e) {
  const r = e && e.range;
  if (!r || r.getSheet().getName() !== 'Comments' || r.getRow() < 2) return;
  if (r.getLastColumn() < 7 || r.getColumn() > 9) return;
  for (let row = r.getRow(); row <= r.getLastRow(); row++) r.getSheet().getRange(row, 10).setValue(Date.now());
}

// Ask AI: the page's 🤖 panel sends a question here, and this calls Claude with the API key kept in
// Script properties, so the key never reaches the public page. One chat stays on one reading: the
// page sends that reading's notes (frozen when the chat began) and the whole conversation so far,
// assistant turns exactly as Claude returned them.
const AI_MODEL = 'claude-opus-5-5';
const AI_RULES = [
  'You are a CFA Level II tutor built into my revision ledger, a page of my own notes for the exam.',
  'When notes for a reading are attached, ground your answer in them and use their terms. If my notes are wrong or incomplete, say so plainly and give the correct version.',
  'Answer the question first, then explain why. For a calculation, write the formula, then the numbers, step by step, then the result.',
  'I read this on my phone: keep answers short. Use plain paragraphs, short bullet lists and **bold** for key terms. No tables, no headings and no LaTeX: write formulas in plain text, like PV = CF / (1 + r)^n.',
].join('\n');

function ask_(a) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) return { ok: false, error: 'Add ANTHROPIC_API_KEY in the script’s Project Settings > Script properties' };
  const msgs = Array.isArray(a.messages) ? a.messages : [];
  const turnsOk = msgs.length && msgs.length % 2 === 1 && msgs.every((m, i) => m && m.role === (i % 2 ? 'assistant' : 'user') && m.content);
  if (!turnsOk) return { ok: false, error: 'Bad chat' };
  const notes = String(a.context || '');
  if (notes.length > 600000) return { ok: false, error: 'These notes are too long to send' };

  const system = [{ type: 'text', text: AI_RULES }];
  // Cached for an hour, so follow-up questions on the same reading don't pay for the notes again.
  if (notes) system.push({ type: 'text', text: 'Reading on screen: ' + a.reading + '\n\nMy notes for it, as JSON from the page:\n' + notes,
    cache_control: { type: 'ephemeral', ttl: '1h' } });

  let res;
  try {
    res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01' },
      // fallbacks: if a safety check declines the question, Claude retries it on another model.
      payload: JSON.stringify({ model: AI_MODEL, max_tokens: 8000, output_config: { effort: 'medium' }, fallbacks: 'default', system, messages: msgs }),
    });
  } catch (err) {
    return { ok: false, error: 'Claude took too long or could not be reached: try again' };
  }
  let body = {};
  try { body = JSON.parse(res.getContentText()); } catch (err) {}
  const code = res.getResponseCode();
  if (code !== 200) {
    const msg = (body.error && body.error.message) || ('HTTP ' + code);
    if (code === 401) return { ok: false, error: 'The API key was rejected: check ANTHROPIC_API_KEY' };
    if (code === 429 || code === 529) return { ok: false, error: 'Claude is busy: try again in a minute' };
    return { ok: false, error: msg };
  }
  return { ok: true, content: body.content || [], stop: body.stop_reason, usage: body.usage };
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
