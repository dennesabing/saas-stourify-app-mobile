# Code formatting in this app

**Who this is for.** Anyone — person or agent — about to write code in this repository, or
wondering why `git blame` on a whole file points at one commit in August 2026.

**The short version.** This app is prettier-formatted. Run `npm run format` whenever you like, on
whatever you like: it is safe, because everything already conforms. `npm run format:check` runs as
part of the app's test gate, so unformatted code cannot land.

That is a change. Until STOURIFY-163 this page said the opposite, and the history below is worth
reading, because the reason it changed is more useful than the answer.

## How to use it

```bash
npm run format         # format everything
npm run format:check   # ask, change nothing (this is what the gate runs)
```

Prettier is a pinned devDependency — `3.9.6`, exactly, not a range. Two prettier versions format
differently, so an unpinned formatter turns *"is this file formatted?"* into *"formatted by whom,
and when?"*, and the gate would then pass or fail depending on when somebody last ran
`npm install`.

Turn on the blame file once, per clone, so `git blame` looks through the reformat:

```bash
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

GitHub reads that file automatically and needs no setup.

## What is formatted, and what is deliberately not

| | |
|---|---|
| **Formatted** | `.ts`, `.tsx`, `.js`, `.json`, `.yaml` |
| **Not formatted** | `.md` — see below |
| **Not visited at all** | `android/`, `ios/`, `.expo/`, `coverage/`, `package-lock.json` |

**Markdown is excluded on purpose.** The prose in this repository is written to a standard that
lives outside it — `saas-boilerplate/docs/system-wide-docs/system-teaching-docs-standard.md` — and
that same standard governs the documentation in three sibling repositories where prettier does not
run. Formatting one repository's prose to a tool's opinion while its siblings keep the standard's
produces drift in a body of writing that is meant to read as one thing. Better all four by hand
than one by machine.

`CHANGELOG.md` and `changelogs/` have a second reason: they are append-only records, and
reformatting history is churn on files nobody re-reads.

## How this came about

Three cards, and the shape of the story is the useful part.

**STOURIFY-99** finished by running `npx prettier --write` on the two files it had edited. There was
no configuration to read, so prettier used its own defaults — double quotes, semicolons — against a
codebase written with single quotes and none. It rewrote both files end to end. A forty-line
feature landed as **459 insertions and 217 deletions**. Nothing broke. The entire cost was paid by
whoever had to review the diff.

A decorator asked to touch up one scratch, who repaints the whole wall. The wall is fine. Nobody
can now see which bit was the repair.

**STOURIFY-162** undid that, and added `.prettierrc` so the next stray run would at least not flip
every quote. It also measured something uncomfortable: with that config in place, **114 of the
app's 247 TypeScript files still disagreed with it.** So the config shrank the blast radius without
removing it, and this page said so, and told people not to point a formatter at files they were not
already editing.

**STOURIFY-163** — this change — ended that, because a config in that state is the one option
nobody actually chose.

> **Lesson.** A rule that only some of the material follows is not a rule, it is a preference with
> a filename. It cannot be checked, so it cannot be enforced, so the only thing keeping it alive is
> people remembering — which is exactly the state the first accident happened in.

## The measurement that decided it

The obvious defence of leaving things alone is that the code was *deliberately* hand-formatted and a
tool would ruin it. That was tested, and it is not what the numbers say.

Across 35,598 lines of TypeScript:

| longer than | lines | share |
|---|---|---|
| 100 columns (the configured width) | 451 | 1.3% |
| 120 columns | 121 | |
| 150 columns | 22 | |

Only **1.3%** of lines were even longer than the width prettier was asked to keep to — and yet
prettier changed **2,377** of them. So the churn was never about long lines. It was prettier
disagreeing with how a construct had been broken, on lines that already fit, **in both directions**:
joining some three-line calls onto one line while splitting others.

That is the whole argument. There was no consistent hand-wrapping style here for a tool to ruin.
There were 247 unconnected decisions, each reasonable on its own. Prettier did not override a house
style; it supplied the first one.

> **Lesson.** Before defending existing formatting as intentional, check whether it is *consistent*.
> "Hand-crafted" and "inconsistent" look identical in any single file, and they are opposite answers
> to whether a formatter helps.

## Two things that surprised us

**Counting files is the wrong unit.** STOURIFY-162 measured how many *files* differ at each print
width, found the number nearly flat — 117 at 100 columns, 112 at 110, 116 at 120 — and concluded the
width barely mattered. Counting *lines* instead, it moves by about 20%: the reformat is **+1,717**
net lines at width 100 and **+278** at width 120.

The width stayed at 100 anyway, and the reasoning is worth keeping: `printWidth` governs the code
**forever**, the migration happens **once**, and trading a permanent setting for a one-time saving
of a few hundred lines is a bad exchange. But "the file count is flat" and "the churn is flat" are
different claims and only the first one was true.

> **Lesson.** When a measurement says a choice does not matter, check that it is measuring the thing
> the choice affects. A number that does not move is only reassuring if it *could* have moved.

**Prettier is not perfectly idempotent.** On `__tests__/sync/status.test.ts`, running `--write` a
second time produced *different* output from the first — a method chain it formats one way, then
another. So `format` followed immediately by `format:check` can fail.

The tree is committed at the fixed point: `format` was re-run until `format:check` passed. If you
ever see the check fail on a file you just formatted, run `npm run format` once more before going
looking for a deeper cause.

> **Lesson.** "Running the tool makes the tool happy" is an assumption, not a guarantee, even for a
> tool whose entire job is to produce one canonical output. Check for the fixed point rather than
> assuming one pass reaches it.

## What was considered and not done

**Staying hand-formatted, and saying so.** Genuinely cheaper: no churn, no risk, no blame
disruption, and 2,400 changed lines that buy no user anything. It lost because a stray
`npx prettier --write` — or an editor's format-on-save, which most ship enabled and nobody remembers
turning on — would still have rewritten 114 files, with nothing but this page standing in the way.

**Listing the 114 non-conforming files in `.prettierignore`**, so the check passed immediately and
the list shrank as files were converted. This was the closest call: it is a real migration pattern,
it delivers the same gate for zero churn, and new files are born conforming. It lost because a
ratchet needs a pawl — nothing ever forces an entry off the list, so the list becomes permanent, the
gate ends up guarding only the files that were already fine, and the worst-formatted files in the
app become the ones the formatter may never touch.

**Widening `printWidth` to make the migration cheaper.** See above; the setting outlives the
migration.

**Pinning line endings and setting `endOfLine: "lf"`.** `"auto"` means the check can say nothing
about line endings, which is a real gap. But `"lf"` without a matching `.gitattributes` fails on
every file on a Windows checkout — which is what this project is developed on — so it cannot be
adopted alone, and adopting both would have put an unrelated repository-wide change inside the
formatting commit. `"auto"` takes each file as it finds it, which is the right behaviour for a
setting whose alternative is noise.

## Lessons

1. A rule that only some of the material follows is a preference with a filename: it cannot be
   checked, so it cannot be enforced, so it survives only on memory.
2. Before defending existing formatting as intentional, check whether it is consistent —
   "hand-crafted" and "inconsistent" look the same in any single file and imply opposite answers.
3. When a measurement says a choice does not matter, check it is measuring what the choice affects.
4. "Running the tool makes the tool happy" is an assumption; look for the fixed point.
5. A migration baseline needs something that forces it to shrink, or it is just a permanent
   exemption list.

## Glossary

- **`.git-blame-ignore-revs`** — a file listing commits `git blame` should look through, so a bulk
  reformat does not become the author of every line.
- **Idempotent** — an operation that gives the same result run twice as run once. Prettier is
  *almost* idempotent; see above.
- **`printWidth`** — the column prettier tries to keep lines under. A target, not a limit: an
  unbreakable string will exceed it.
- **Prettier** — a formatter that reprints a program from scratch to one fixed style, rather than
  correcting specific violations. It has few options on purpose.
- **Ratchet / baseline** — a migration technique that exempts existing violations so a rule can be
  enforced on everything else immediately.
