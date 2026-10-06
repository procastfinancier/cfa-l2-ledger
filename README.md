# CFA Level II — Knowledge Ledger

A personal revision tool: 42 topics across 10 subjects, filled in with my own
teach-back explanations, flagged gaps, and tuition misses.

Live page: https://procastfinancier.github.io/cfa-l2-ledger/

- **Amber "Gap"** — flagged during teach-back (my explanation was incomplete or wrong).
- **Rose "Tuition miss"** — got it wrong on an external tuition test.
- **Teal** — mastered.

The page is read-only apart from the search box, the revision controls and the
💬 comments box; all
content lives in the data structures at the bottom of `index.html` (`CONTENT`,
`GAPS`, `TUITION_MISSES`, `STATUS`, `LINKS`).

## Comments

Tap 💬 next to any session, sub-heading or module (or the floating 💬 button for
the section on screen) to pin a doubt, a fix, something to add, or an idea.
**My comments** lists them all, lets me resolve them, and copies the open ones as
a prompt for Claude.

Comments save in the browser at once. To share them between phone and PC, set up
`ledger-comments.gs` once (steps at the top of the file) and enter its URL and
passphrase under **My comments › Sync settings** on each device.

On the PC, with the same URL and passphrase in `.comments-sync.json`
(gitignored), Claude can read and resolve them directly:

    node tools/comments.mjs                       # open comments
    node tools/comments.mjs resolve <id> "reply"  # resolve with a reply shown on the page

## Revision

Each notebook session has a **Revised** tick (counts passes), a **🙈 Blurt first**
mode that hides the notes while I write down what I remember, and a **Test
yourself** checkpoint (written so far for Reading 19). A session counts as
**Understood** only when every checkpoint question is graded *Got it*. Shaky and
missed questions come back after 1 day; correct ones after 3, 7, 14, then 30 days.
**📈 Revision** shows progress across all readings and runs the due reviews.
Progress syncs through the same sheet as comments (`Progress` tab).

    node tools/comments.mjs progress              # passes, and questions still shaky or missed

## Exam-day revision

Three pages at the top of the sidebar, for the last days before the exam:

- **📐 Formula sheet**: every formula from every reading, session by session.
- **📝 Concise notes**: each reading as a revision overview (`EXAM` in
  `index.html`): what it covers and how its topics connect, then every session
  summarised in prose with its key points, formulas and tuition weak spots.
- **⭐ Exam-day set**: everything starred. Tap ☆ on a reading, a session, any block
  in the notes (definition, example, formula), or any line on the two sheets.

Every line has a ↗ link back to the block it came from, and each session in the
notes links forward to its 📝 / 📐 lines. Stars sync through the same sheet as
progress (redeploy `ledger-comments.gs` once so it keeps them).

### Keeping it in step with the notes

The formula sheet rebuilds itself from the notes on every page load. The concise
notes are written by hand, so every update to the notes has to carry them along:

1. **Same change**: whoever adds or edits a session updates the reading overview
   and writes that session’s summary and key points in `EXAM` too (a rule in the page’s session-rules panel says so for Claude).
2. **Before each commit**: `tools/hooks/pre-commit` runs the check below and stops
   the commit if a session has no exam notes or a ↗ link broke. Turn it on once per
   clone with `git config core.hooksPath tools/hooks`.
3. **After each push**: the *Exam sheet in step* GitHub check runs it again; a red ✗
   on the commit (and an email from GitHub) means something slipped through.

    node tools/exam-check.mjs
