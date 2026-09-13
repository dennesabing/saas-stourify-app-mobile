# What the spot page leaves out

For anyone comparing the app's spot page with artboard 1, "Spot Profile", of
`docs/design/Stourify - Spot Hub.dc.html`, and wondering why some of what it draws is missing. It
lists each thing left out, why, and what would have to exist first.

Think of a shop fitter working from an architect's drawing. The drawing shows a coffee machine on
the counter, but the building has no water pipe to that wall yet. The fitter leaves the space empty
rather than bolting up a machine that can't make coffee. Everything below is that kind of empty
space: the canvas draws it, and nothing in the app or on the server stands behind it yet.

STOURIFY-292 built the page to the canvas and deliberately left these out.

## Left out

| On the canvas | Why it's not on the page | What would have to exist first |
|---|---|---|
| **"Best time" and opening hours, with an "OPEN" badge** | Nothing in the app lets anyone enter or edit hours, and STOURIFY-257 left the hours editor out for the same reason. An "OPEN" badge nobody can keep true is worse than none. | A way to enter and edit hours, and a rule for what "open" means. |
| **The Events tab and the upcoming-events strip** (and artboards 7 and 8) | There are no events in the app. An empty Events tab on every spot would say "this place is dead" when the truth is "this feature doesn't exist". | An events feature, on the server and in the app. |
| **Contributors** ("Maya R. · 12 photos") and artboard 5 | No endpoint lists who contributed to a spot. It would mean counting each person's photos and reviews per spot on the server. | A backend endpoint for a spot's contributors. |
| **Turn-by-turn directions and offline routes** (artboard 6) | **Directions** hands off to the phone's own map app, which already does turn-by-turn. Building navigation into Stourify is a product decision, not a restyle. | A decision to build in-app navigation. |
| **"Add your photo"** | It would need the post composer to open with this spot already chosen, which is a new way in. | A spot-preselected entry into the composer. |
| **A live map in the map card** | The map card is drawn: a tinted panel with a pin, the address, the coordinates and "Get directions". A real map tile would add a Google Maps load to every spot opened, and would show nothing offline, where the rest of this page works. | Nothing to build. Revisit if a real map proves worth that cost. |

## Placed differently from the canvas

- **Share is in the action row only, not also on the photo.** It arrived with STOURIFY-301, which
  gave every public spot a web page (`<share host>/s/<uuid>`) that opens on any phone, app or no
  app. The button sends that link through the phone's own share sheet. It appears only when the
  server sends a `share_url`, which it does not for a draft or for a private account's spot, so the
  app never hands a friend a link that opens "this spot isn't public". One Share is enough: the
  photo already carries Back and Save, and Save is already drawn twice.

- **The title block sits under the photo, not printed on it.** The photo is a button that opens
  the gallery, and the rating line is a button that opens the reviews. Putting one inside the other
  is a touch-target nesting this screen has avoided since STOURIFY-64. White text on a contributor's
  photo is also unreadable over a pale sky.
- **The page opens on About.** The canvas opens there, and the map card lives there, so a spot says
  where it is before anyone taps. `stourify://spot/<uuid>?tab=photos` and `?tab=reviews` open the
  other two tabs. The old `?tab=posts` still opens Photos.

The reasoning behind each choice is on the card, STOURIFY-292, as its `ASSUMPTION:` notes.
