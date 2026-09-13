# What the spot's photos and reviews screens leave out

For anyone comparing the app's photo gallery, reviews list and Write a review screen with artboards
2, 3 and 4 of `docs/design/Stourify - Spot Hub.dc.html`, and wondering why some of what they draw is
missing. It lists each thing left out, why, and what would have to exist first. The spot page itself
(artboard 1) has its own list: [`what-the-spot-page-leaves-out.md`](what-the-spot-page-leaves-out.md).

Think of a shop fitter working from an architect's drawing. The drawing shows a coffee machine on
the counter, but the building has no water pipe to that wall yet. The fitter leaves the space empty
rather than bolting up a machine that can't make coffee. Everything below is that kind of empty
space: the canvas draws it, and nothing in the app or on the server stands behind it yet.

STOURIFY-293 built the three screens to the canvas and deliberately left these out.

## Left out

| On the canvas | Why it's not on the screen | What would have to exist first |
|---|---|---|
| **The 5-to-1 bar chart** on Reviews | The app gets a spot's average and its review count, never how many reviews gave each star. Counting the reviews it has loaded would be wrong as soon as there is a second page: a spot whose newest reviews happen to be glowing would show "all 5 stars". A chart that misleads is worse than no chart. | A per-star count on the spot, sent by the server. |
| **Filter chips**, "All / ★5 / ★4 / With photos" | The reviews request can sort but not filter by stars, and a review cannot hold a photo. | A star filter on the reviews endpoint, and photos on reviews. |
| **Reply** on a review | Reviews have no replies. | Replies to reviews, on the server and in the app. |
| **Photos on a review**, and **"Add photos"** on Write a review | A review can't hold a photo today. | Media on reviews, including how a photo waits for the signal like the review itself does. |
| **Rank labels** like "Local expert" | There are no explorer ranks. | A ranking system. |

## Placed differently from the canvas

- **The spot's name stays on the Photos and Reviews screens**, as a second line under the title.
  STOURIFY-199 and STOURIFY-209 each asked for it after people lost track of which spot they were
  looking at. Write a review names the spot in its spot card, as the canvas draws it.
- **"Post review" can be pressed before a rating is chosen.** The canvas greys it out. Pressed early,
  it says "Choose a rating before posting.", where a grey button never says why.
- **The empty stars on Write a review have an outline**, so they still show on the dark theme's
  near-black page. The canvas is drawn in light only.

## Built, where the canvas and the app used to disagree

- **The gallery shows every photo of the spot.** Until STOURIFY-293 it showed only the spot's own
  photos, which have no author, no likes and no post. The photos people posted there now follow
  them. That is what the lightbox's author and "Open post" button, and "Top rated", need to work.
- **"Helpful · N" works**, online only. The server has supported it for a long time, through the
  shared reactions endpoint; no screen called it before. A vote with no signal says it couldn't reach
  the server and changes nothing, because votes are not saved on the phone for later.

The reasoning behind each choice is on the card, STOURIFY-293, as its `ASSUMPTION:` notes.
