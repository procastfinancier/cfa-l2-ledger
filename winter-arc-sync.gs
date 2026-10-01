/**
 * Winter Arc sync: keeps the Winter Arc panel's daily log and slot times in this Google Sheet,
 * so every device that opens the ledger page sees the same data.
 *
 * Setup (once):
 *   1. Paste this file into Extensions > Apps Script of your Winter Arc Google Sheet.
 *   2. Change PASSPHRASE below to your own phrase and save.
 *   3. Run setup() once and allow access when Google asks.
 *   4. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone. Copy the URL.
 *   5. On the ledger page, open Winter Arc > Progress > Google Sheet sync, and enter the URL
 *      and the same passphrase. Do that once on each device.
 *
 * Tabs it keeps:
 *   Log    one row per day in the Tracker sheet's columns. You can edit Notes here.
 *          "Tasks" holds the per-task ticks and minutes: leave it alone.
 *   Times  no longer used by the page: a slot moved on one day is saved with that day, in Tasks.
 */
const PASSPHRASE = 'change-me';

const LOG_HEADERS = ['Date', 'Day', 'Phase', 'Woke on time', 'Study block 1 (hrs)', 'Study block 2 (hrs)',
  'Walk / exercise', 'CFA study', 'Slept on time', 'Total study hrs', 'Habits done (of 4)', 'Notes',
  'Tasks (do not edit)', 'Updated'];
const TIME_HEADERS = ['Timetable', 'Activity', 'Time'];
const NAVY = '#1F3864';

function setup() {
  tabs_();
  SpreadsheetApp.getActive().toast('Winter Arc sync is set up. Now deploy it as a web app.');
}

function tabs_() {
  const ss = SpreadsheetApp.getActive();
  const make = (name, headers, widths, textCols) => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers])
        .setFontWeight('bold').setFontColor('#FFFFFF').setBackground(NAVY).setFontFamily('Arial');
      sh.setFrozenRows(1);
      widths.forEach((w, i) => sh.setColumnWidth(i + 1, w));
    }
    // Stored as text so Sheets doesn't turn "2026-10-05" or "10:45 PM" into dates and times.
    textCols.forEach(c => sh.getRange(1, c, sh.getMaxRows(), 1).setNumberFormat('@'));
    return sh;
  };
  const log = make('Log', LOG_HEADERS, [95, 45, 90, 95, 120, 120, 105, 80, 95, 100, 115, 260, 160, 110], [1, 13]);
  const times = make('Times', TIME_HEADERS, [100, 200, 170], [1, 2, 3]);
  const blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 2) ss.deleteSheet(blank);
  return { ss, log, times };
}

// Opening the web app URL in a browser shows this, which confirms the deployment works.
function doGet() {
  return json_({ ok: true, app: 'winter-arc-sync' });
}

// One request does both directions: the page sends the days and times it changed, newer copies
// replace older ones, and the reply carries everything in the sheet.
function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'Bad request' }); }
  if (PASSPHRASE === 'change-me') return json_({ ok: false, error: 'Set PASSPHRASE in the script, then deploy a new version' });
  if (!req || req.key !== PASSPHRASE) return json_({ ok: false, error: 'Wrong passphrase' });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const { ss, log, times } = tabs_();
    const tz = ss.getSpreadsheetTimeZone();
    const isoOf = v => v instanceof Date ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : String(v).trim();

    const last = log.getLastRow();
    const rows = last > 1 ? log.getRange(2, 1, last - 1, LOG_HEADERS.length).getValues() : [];
    const at = {};
    rows.forEach((r, i) => { at[isoOf(r[0])] = i; });

    let changed = false;
    (req.days || []).forEach(d => {
      if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d.iso) || !d.entry) return;
      const i = at[d.iso];
      if (i != null && (+rows[i][13] || 0) > (+d.u || 0)) return;
      const tr = d.tracker || {};
      const row = [d.iso, tr.day || '', tr.phase || '', tr.woke || '', tr.s1 === '' ? '' : tr.s1, tr.s2 === '' ? '' : tr.s2,
        tr.walk || '', tr.cfa || '', tr.slept || '', tr.total || 0, tr.habits || 0, d.entry.notes || '',
        JSON.stringify(d.entry.t || {}), +d.u || Date.now()];
      if (i != null) rows[i] = row; else { at[d.iso] = rows.length; rows.push(row); }
      changed = true;
    });
    if (changed) {
      rows.sort((a, b) => isoOf(a[0]) < isoOf(b[0]) ? -1 : 1);
      log.getRange(2, 1, rows.length, LOG_HEADERS.length).setValues(rows);
    }

    const props = PropertiesService.getScriptProperties();
    let timesU = +props.getProperty('timesU') || 0;
    if (req.times && (+req.times.u || 0) >= timesU) {
      const out = [];
      Object.keys(req.times.data || {}).forEach(type =>
        Object.keys(req.times.data[type] || {}).forEach(name => out.push([type, name, req.times.data[type][name]])));
      if (times.getLastRow() > 1) times.getRange(2, 1, times.getLastRow() - 1, 3).clearContent();
      if (out.length) times.getRange(2, 1, out.length, 3).setValues(out);
      timesU = +req.times.u || Date.now();
      props.setProperty('timesU', String(timesU));
    }

    const logOut = {};
    rows.forEach(r => {
      const iso = isoOf(r[0]);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
      let t = {};
      try { t = JSON.parse(r[12] || '{}'); } catch (err) {}
      logOut[iso] = { t, notes: String(r[11] || ''), u: +r[13] || 0 };
    });
    const timesOut = {};
    if (times.getLastRow() > 1) {
      times.getRange(2, 1, times.getLastRow() - 1, 3).getValues().forEach(r => {
        if (!r[0] || !r[1] || !r[2]) return;
        (timesOut[r[0]] = timesOut[r[0]] || {})[r[1]] = String(r[2]);
      });
    }
    return json_({ ok: true, log: logOut, times: { u: timesU, data: timesOut } });
  } finally {
    lock.releaseLock();
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
