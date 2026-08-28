# What makes the app sign itself out

**For:** anyone picking up STOURIFY-214 or STOURIFY-224, or anyone who has just watched the app land
on the login screen without touching it. It tells you what is already ruled out, what is not, and
how to read the one line the app now leaves behind when it ends its own session.

## The thing that happened

On 2026-08-27, on the physical Samsung handset, the app was signed in and syncing normally. Two
airplane-mode cycles later — nobody touching the phone, nothing tapped — it was sitting on
`Welcome back`.

That is worse than an annoying logout. `signOut()` in `src/sync/session.ts` is one teardown path
with six steps, and two of them destroy data that exists nowhere else: `wipeDatabase()` drops every
local row, and `resetSyncState()` clears the sync cursor. A spot created in a blackspot, and its
photos, are gone — not "still waiting". The whole offline-first design is sold on the opposite
promise.

And there was nothing to read afterwards. The database that might have held a clue was the thing
that had just been erased.

## What is already ruled out, by reading rather than guessing

The card that opened this investigation named two suspects. One of them is dead, and it is worth
knowing why so nobody spends another session on it.

**A dropped radio cannot be read as an auth rejection.** In
`packages/offline-sync-core/src/httpClient.ts`, the function that decides "this is an auth
rejection" is only ever called from code that is already holding a real HTTP response. A `fetch()`
that fails to produce one — no signal, a refused connection, a timeout — throws before it gets
anywhere near that decision: it reports the server as unreachable and rethrows. The screens' axios
client guards the same way, on `error.response?.status === 401`, and an axios network error has no
`response` at all.

`src/__tests__/httpClient.test.ts` now asserts this rather than leaving it as a claim in a comment.
If somebody later loosens that path, a test says so.

## What is not ruled out — and the suspect nobody had named

A request only carries an `Authorization` header **when the token store had a token to give**:

```ts
if (token) headers['Authorization'] = `Bearer ${token}`
```

So a request can leave the phone asking anonymously. The server then answers `401`, entirely
correctly — it was asked by nobody. And the client reads that `401` as *your saved login was
rejected*, and wipes the device.

A `401` answering an anonymous request is not evidence about the stored token. It is evidence that
no token was sent, which is a completely different problem with a completely different fix. There is
a characterization test pinning today's behaviour, marked as such, so the repair card has something
concrete to flip.

The other suspect — that the token simply expired — is still open, and would be a perfectly
legitimate reason to sign out. It is not a reason to destroy unsent work, which is a separate
question answered on STOURIFY-214.

## The line the app now leaves behind

`src/sync/signOutRecord.ts` writes one line at the moment `signOut()` decides to run, **before**
anything is torn down. Read it with:

```bash
adb logcat | grep S214
```

One occurrence looks like this:

```
S214 09:41:02.123 signOut trigger=sync-client-rejected status=401 method=GET path=/stourify/sync/delta credentialSent=false unsentRows=3 unsentPhotos=1
```

| Field | What it tells you |
|---|---|
| `trigger` | `user-logout` and `account-closed` are somebody's decision. `sync-client-rejected` and `api-client-rejected` are the app's own. |
| `status` | The HTTP status read as a rejection — `401`, or `403` for a disabled account. A dash means no response was involved. |
| `method`, `path` | Which request. This is what tells you whether the sync loop or a screen caused it. |
| `credentialSent` | **The field to read first.** `false` means the request went out with no credential, so the `401` says nothing about the stored token. |
| `unsentRows`, `unsentPhotos` | How much work was about to be destroyed. This is the difference between an annoyance and data loss. |

Two design points, because both are easy to undo by accident:

- **It is written first, before the teardown.** The queue depth is reset partway through `signOut()`,
  so a record taken at the end would report zero on every sign-out — including the ones that threw
  a user's work away.
- **It is always on.** The sync trace next door (`src/sync/trace.ts`) is gated behind
  `EXPO_PUBLIC_SYNC_TRACE`, for good reasons that do not apply here: this is one line, at most once
  per session, at the moment the app is already discarding the whole database, and it carries a
  status code, a method, a path, two booleans and two counts — no user content. An instrument you
  have to arm in advance is one you do not have the one time it fires, and that is exactly how this
  investigation started.

## Reproducing it, if you want to try

Use the reconnect protocol in
[`does-the-vpn-explain-the-stuck-offline-flag.md`](does-the-vpn-explain-the-stuck-offline-flag.md) —
including its instruction to prove the backend's request log is alive before counting a single
round. Nothing here replaces it.

**One warning that matters more than the experiment.** Nobody has recorded credentials for the
account the handset is signed in as. If the app does sign itself out, you cannot sign it back in,
and every later check that needs an account is gone with it. So do not provoke a sign-out
deliberately, and do not clear the app's data to "start clean".
