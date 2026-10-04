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
