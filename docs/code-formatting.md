# Code formatting in this app

**Who this is for.** Anyone — person or agent — about to run a formatter over this repository, or
wondering why `.prettierrc` exists when prettier is not in `package.json`.

**The short version.** This code is written by hand, not by a formatter. `.prettierrc` records the
style it is written in so that a formatter somebody does run causes as little damage as possible.
It is a seatbelt, not a driver.

## Why the file exists

A formatter with no configuration is not neutral. It is a formatter carrying somebody else's
opinion, and it applies that opinion to every line of every file you point it at.

That is what happened under STOURIFY-99. The run finished by calling `npx prettier --write` on the
two files it had edited. Prettier found nothing to read, used its own defaults — double quotes,
semicolons — and rewrote both files end to end. A forty-line feature landed as **459 insertions and
217 deletions**. Nothing broke; the suite was green either side of it. The whole cost was paid by
whoever had to review the diff.

`.prettierrc` is the answer to that specific accident. With it in place, a formatter that runs here
no longer flips every quote and appends a semicolon to every statement, because it now knows this
codebase uses single quotes and no semicolons.

## What it does not do — measured, not guessed

**It does not make `npx prettier --write` safe.** Running prettier over all 244 TypeScript files
under `src/` and `__tests__/`, with these settings, **about 110 of them still come out different.**

That number barely moves with the print width — 117 files at 100 columns, 112 at 110, 116 at 120 —
because the disagreement is not about a setting. Quotes, semicolons, trailing commas, arrow
parentheses and JSX quotes all already match what prettier does. What differs is **where a line was
wrapped**, and the answer to that varies file by file, because a person chose it each time.

So the honest description is: the config shrinks the blast radius from *every string and every
statement in the file* down to *some lines re-wrapped*. That is a real improvement and it is not a
fix. **Do not point a formatter at a file you are not already editing**, and do not add a `format`
script — a `format` script is a hundred-file reformat with a friendlier name.

## Where the settings came from

Read off the existing code rather than chosen:

| Setting | Value | Why this value |
|---|---|---|
| `semi` | `false` | No statement in the app ends in a semicolon. |
| `singleQuote` | `true` | JavaScript strings are single-quoted throughout; JSX attributes stay double-quoted, which is prettier's default and matches the code. |
| `printWidth` | `100` | Across 33,900 lines the 95th percentile is 82 columns and the 99th is 103. Only 120 lines in the app pass 120 columns, and most of those are prose comments or long strings no setting can wrap. The check that settled it: `src/shared/components/ui/Input.tsx`, before STOURIFY-99 touched it, is byte-for-byte what prettier produces at 100. |
| `endOfLine` | `"auto"` | Nothing to do with style. Git here runs with `core.autocrlf=true`, so files sit in the working tree with Windows line endings and are stored with Unix ones. Prettier's default insists on Unix and therefore flags **every file in the repo**, which drowns every real signal. `"auto"` takes each file as it finds it. |

Everything not listed is prettier's default, and that is deliberate: a setting written down is a
setting somebody has to maintain, and each of the four above earns its line.

## Prettier is not a dependency, on purpose

It is not in `package.json` and should not be added. `npx prettier` fetches it when somebody
genuinely wants it, and `.prettierrc` is read by that copy and by every editor's format-on-save
plugin just the same. Adding the package would invite a `format` script, and the paragraph above
says why that is the thing to avoid.

## If you want the config to be a complete answer

Then the repo has to actually be prettier-formatted, which means one deliberate commit that
reformats roughly 110 files and nothing else. That is worth doing on purpose, with its own card and
its own review — but it is a change no test gate can meaningfully exercise, so it should never ride
along inside another card.
