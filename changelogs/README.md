# Per-release APK changelogs

One file per published build: `<version>.changelog.md` (e.g. `0.3.0.changelog.md`). These are the
**user-facing release notes shipped with the APK** — `files:upload --type=apk --changelog=…`
uploads the file next to the binary, and the public
[download page](https://stourify.zivsluck.com/download-app) renders it from `manifest.json`.

## Not to be confused with `../CHANGELOG.md`

| | `../CHANGELOG.md` | `changelogs/<version>.changelog.md` |
|---|---|---|
| Audience | developers | the person installing the APK |
| Format | [Keep a Changelog](https://keepachangelog.com/) — `## [Unreleased]`, `### Added/Changed/Fixed` | free-form user-facing notes |
| Written | with every change | at publish time, for that build only |
| Required | always | only when publishing an APK |

The distinction matters because the two answer different questions. `CHANGELOG.md` answers "what
changed in this codebase?" — it is a running record, and an entry like *"fix: guard against a null
`spot.photos` in the gallery reducer"* is exactly right there. This folder answers "what is
different on my phone?", where that same entry is noise. Write the second from the first, in the
installer's language.

## Naming

The file must match `expo.version` in `mobile/app.json` **verbatim**, including any `.dev.N`
suffix. `scripts/mobile-apk-builder.ps1` resolves `changelogs/$RawVersion.changelog.md` and
**refuses to build without it**.

That refusal is deliberate. A release note is the one artifact with no technical dependency on
anything — nothing breaks if it is missing, which is precisely why it gets skipped, and skipping
it once sets the precedent. Making it a build precondition puts the cost at the only moment
someone is definitely paying attention.

> **Lesson.** If a step is important but nothing enforces it, it will be skipped. Attach it to a
> step that cannot be skipped.

## Shape

```markdown
# Stourify 0.3.0

One-line framing of what this build is about.

## New
- **Feature name.** What the user can now do, in their words, not the code's.

## Improved
- Smaller wins, phrased as outcomes.

## Fixed
- The symptom the user saw, not the cause you found.
```
