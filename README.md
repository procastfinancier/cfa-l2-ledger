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

## Ask AI

**🤖 Ask AI** (header, or the floating 🤖 button) opens a chat with Claude about the reading on
screen. Claude gets that reading's notes, gaps, tuition misses and exam notes, plus the section in
view. Each reading has its own chat; **New chat** starts again. The last six chats stay on the device.

Questions go through `ledger-comments.gs`, which holds the Anthropic API key, so the key never
appears on the public page. Setup is at the top of that file: add `ANTHROPIC_API_KEY` under Script
properties, then deploy a new version. It uses the API (billed per question at console.anthropic.com),
not a Claude subscription. To change the model, edit `AI_MODEL` in the script.

## Revision

Each notebook session has a **Revised** tick (counts passes), a **🙈 Blurt first**
mode that hides the notes while I write down what I remember, and a **Test
yourself** checkpoint (written so far for Reading 19). A session counts as
**Understood** only when every checkpoint question is graded *Got it*. Shaky and
missed questions come back after 1 day; correct ones after 3, 7, 14, then 30 days.
**📈 Revision** shows progress across all readings and runs the due reviews.
Progress syncs through the same sheet as comments (`Progress` tab).

    node tools/comments.mjs progress              # passes, and questions still shaky or missed

## Countdown and daily plan

The bar at the top counts down to the exam (`EXAM_AT`, 22 Nov 2026, 9:00 IST) and
shows how many of today's tasks are ticked. Tap it, or **📅 Daily plan** in the
sidebar, for today's tasks, anything left over from earlier days, the mocks done,
and the whole schedule (`PLAN` in `index.html`): one revision pass on office days
until 31 Oct, then from 1 Nov a mock every other day with a review and second-pass
day after each. Ticks sync through the same sheet as progress.

## Test log

Put a test result PDF in `Written Notes/<subject>/Test Result` and ask Claude to
log it. Claude adds it to `TESTS` in `index.html`, tagging every question with the
session it tests and, for a miss, the kind of mistake (didn't know it, went the
wrong way, slip in the working, or a lucky guess). Each wrong answer also becomes a
rose weak-spot card.

**Accuracy** shows questions logged (of about 3,000), overall and latest-50
accuracy against a 70% target, pace, a trend chart (a dot per test, five-test
average line), and accuracy by subject and reading, weakest first. Every test
with wrong answers comes back after 3 days under **Revise these first** to redo
those questions.

**🧪 Test log** (sidebar) turns that into what to revise next:

- **Revise these first**: each session gets a verdict from the latest test on it:
  *Dig in* (a miss I didn't know, or two or more misses), *Quick fix* (one miss) or
  *Move on*. **Mark fixed** after the fix brings it back as a *Retest due* 5 days later.
- **Mistakes by kind**: how to revise each kind (re-study, drill the direction, redo
  worked examples).
- **Tests**: score, pace against the exam's 3 minutes a question, and a reminder to
  retake old tests.

Tuition weak-spot cards can be folded: **Hide ▴** on one card, or **Hide all weak spots**
(remembered on the device; **Always show** brings them back).

Each session in the notes shows a 🧪 chip with its latest result, and 📈 Revision
shows how many sessions the tests say to fix.

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
