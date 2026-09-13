# Where saved spots come from

For anyone changing the Wishlist screen, the Wishlist tab on your own profile, or how a save is
written. It explains why the list reads two places, and what each part of the code guarantees.

## Two places, one list

Think of a letter you've just posted. It's yours and it's on its way, but the person you sent it to
hasn't opened it yet. Ask them what you've sent and they'll say "nothing". They're right, but
they're answering a different question.

A saved spot works the same way.

- **The server's list** (`GET /api/v1/wishlist`) is the main source. Most saves are of other
  people's spots, and the offline sync only brings down your own spots, so a list read only from the
  phone would be mostly rows with nothing to show. `src/shared/api/wishlist.ts` covers this at
  length.
- **The phone's own saves** are where a save lives first. Tapping Save writes a `sto_wishlist_items`
  row on the phone (`createLocalWishlistItem`), and the sync sends it a minute or two later.

The app is **eventually consistent**: the phone and the server always come to agree, but not
instantly. Until STOURIFY-207 the list read only the server. For that minute or two it said "Nothing
saved yet" while the spot page, which reads the phone, showed the save with its queued mark. That
broke **read-your-own-writes**, the promise that once you've done something, you can see it.

`src/features/spots/hooks/useSavedSpots.ts` now reads both, and both screens use it:

1. **The server's list, as it comes.**
2. **Plus the phone's saves the server's list doesn't show yet.** These are matched by spot, and by
   the save's own id, so a save is only ever one line. A phone save is added when it is still waiting
   to send, or when it carries a copy of its spot (below) and the server hasn't reported it yet. The
   second case covers the moment between "sent" and "the list fetched again", so the row doesn't drop
   out and come back.
3. **When a save finishes sending**, the list asks the server again, and the server's copy takes
   over.

Saves still on the phone are drawn first, marked **Queued ↑**, the same mark reviews and spot cards
use.

> **Lesson.** When two screens read different places, they will disagree for as long as those places
> take to agree. Decide which one a person trusts, and make the other agree with it.

## How an unsent save knows its spot's name

A save of somebody else's spot has no spot row on the phone. So when you tap Save, the save keeps a
small copy of the spot: its title, categories, address and one thumbnail. It goes in
`sto_wishlist_items.spot_snapshot`, a phone-only JSON column added in schema v6. Storing a copy of
data that lives elsewhere is called **denormalization**. A queued post keeps `spot_title` for the same
reason.

- It is **never sent**. `pushService.ts` builds the push field by field, and a test pins that the
  payload is unchanged.
- A pull **never clears it**, because the sanitizer skips any column the server didn't send.
- The thumbnail is chosen by `thumbFor`, the same rule the row uses for the server's copy, so the
  picture doesn't change when the server's copy takes over.

The obvious shortcut, which lost:

```ts
// Rejected: read the spot back from React Query's cache instead of storing it.
//   queryClient.getQueryData<Spot>(['spot', save.spotUuid])
// Tempting because: the spot page already fetched and cached exactly this, so
// it needs no new column and no migration.
// Why it lost HERE: that cache is pruned and expires. After a restart or a day
// the lookup quietly finds nothing, and the row goes blank at random. A copy on
// the save lives exactly as long as the save does.
```

A save with no copy (one made before v6, or saved before the spot page had loaded) falls back to
your own spot's row on the phone if there is one. Otherwise it shows a plain placeholder: "Saved on
this phone. Details appear once it sends."

> **Lesson.** Keep a copy at the one moment you actually hold the data. Later is too late, and a
> cache is not a record.

## When the server's list isn't in hand

If the phone holds unsent saves but the server's list hasn't arrived, the saves still show, with one
line above them (`SavedSpotsNotice`):

| What's happening | What it says |
|---|---|
| The request failed | "Couldn't load the rest of your saved spots", with Try again |
| Offline, nothing read before | "The rest of your saved spots will load when you're back online." |
| Still loading | "Loading the rest of your saved spots…" |

The offline wording matters. With no connection, React Query doesn't fail the request; it **pauses**
it until the connection returns. "Loading" would be a promise the screen can't keep.

With nothing to show at all, the three full-screen states are unchanged: loading, the failure panel,
and "Nothing saved yet".

> **Lesson.** A loading message is a promise. When the screen can't keep it, say what will actually
> happen instead.

## Taking a save back

You can unsave in two places: on the spot page, by tapping the filled Saved button again, and on
the Wishlist screen, with the filled bookmark at the right end of a row (STOURIFY-303). The Wishlist
tab on your profile has no remove button, because its artboard draws none.

Think of the letter again. If it's still on your desk, you bin it and nobody ever knows. If it's
already posted, binning your copy isn't enough; you send a second letter saying "ignore the first".
`src/features/spots/api/removeLocalWishlistItem.ts` makes that choice:

| The save is… | What the phone does | What the server hears |
|---|---|---|
| Still waiting to send | Destroys the row outright | Nothing, ever |
| Already sent | Marks the row deleted | The next push sends its uuid under `deleted` |
| Waiting to send, but a sync is running right now | Marks the row deleted | The create, if it was already on the wire, then the delete |
| Only on the server (never pulled down) | Writes a removal marker for it | The next push sends its uuid under `deleted` |

Nothing new is sent to the server. The delete uses the push this app already makes
(`POST /stourify/sync/push`); the server treats a delete of something already gone as success. That
is why the REST `DELETE /api/v1/wishlist/{id}` stays unused: it only works online.

Two details keep it honest:

- **A removal is a mark, and the mark is the queue.** WatermelonDB hides a row marked deleted from
  every query, so the spot page flips to "Save" at once. `useSavedSpots` also reads the marked ids
  and drops those saves from the server's list, so a refresh before the server has heard can't bring
  one back. `useUnsaveSpot` takes it out of React Query's cached copy of the list at the same time.
- **A save removed mid-flight stays removed.** If the push carrying the save is already on the wire,
  the server creates it. When that push's "created" comes back, `applyPushResults` sees the row is now
  marked deleted, leaves it, and doesn't count it as acknowledged. So the pull waits a cycle instead
  of bringing the save back down, and the next push deletes it.

On the Sync status screen, a removal still waiting reads "Removed a saved spot · Waiting to send". A
save made and removed while offline leaves nothing there, because nothing is waiting. Once the
server acknowledges the delete, the row leaves the screen even while it's open. The acknowledgement
destroys the removal mark in a way the database doesn't announce, so `useSyncQueue` also re-reads
whenever the sync cycle publishes its result to the status store. Before STOURIFY-303 it didn't,
and an open screen kept a sent delete on show until you left it.

```ts
// Rejected: mark every unsaved row deleted, and let the server ignore unknown uuids.
//   await row.markAsDeleted()
// Tempting because: one line, one path, and the server's delete is idempotent.
// Why it lost HERE: a save made and removed offline would still cause a request
// about a save the server never had, and the card forbids exactly that.
```

> **Lesson.** "The server ignores it" isn't the same as "it never reaches the server". If a request
> mustn't happen, prevent it on the phone.

## Lessons

1. When two screens read different places, they will disagree for as long as those places take to
   agree. Decide which one a person trusts, and make the other agree with it.
2. Keep a copy at the one moment you actually hold the data. Later is too late, and a cache is not a
   record.
3. A loading message is a promise. When the screen can't keep it, say what will actually happen
   instead.
4. "The server ignores it" isn't the same as "it never reaches the server". If a request mustn't
   happen, prevent it on the phone.

## Glossary

- **Sync / drain:** the background step that sends the phone's unsent changes to the server. A change
  is "queued" until it drains.
- **Eventually consistent:** two copies of the same data (phone and server) that may disagree for a
  while and are guaranteed to agree once the sync runs.
- **Read-your-own-writes:** after you do something, you can see it straight away, even while other
  parts of the system are still catching up.
- **Denormalization:** deliberately storing a copy of data that lives somewhere else, because the
  reader can't reach the original when it needs it.
- **Paused query:** React Query's state for a request that is waiting for a connection instead of
  failing.
