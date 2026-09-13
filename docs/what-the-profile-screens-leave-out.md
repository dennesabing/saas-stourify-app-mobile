# What the profile screens leave out, and why

**Who this is for:** anyone comparing Edit Profile, the Wishlist or Followers / Following with the
Profile design (`docs/design/Stourify - Profile.dc.html` in the root repo, artboards 2, 3 and 5)
and finding a difference. It says which differences are deliberate, why, and what would have to
exist before each one could go away. Built under STOURIFY-289. The profile page itself (artboards
1 and 6) was STOURIFY-288, and its left-out parts are listed on that card. Onboarding and the
sign-in screens have the same kind of page: [`what-onboarding-leaves-out.md`](what-onboarding-leaves-out.md)
and [`what-the-sign-in-screens-leave-out.md`](what-the-sign-in-screens-leave-out.md).

## The short version

A floor plan can draw a door where the builder hasn't put one yet. You'd rather find a wall than
walk into a door that doesn't open. So the app draws a control only when something real happens
when you use it.

| On the canvas | In the app | Why |
|---|---|---|
| "Change photo" and a camera badge on Edit Profile | Your avatar, with no link | The server takes a photo at `POST /me/avatar`, but nothing in the app picks one and sends it. STOURIFY-307 builds that. |
| An editable "Display name" field | Your name under the avatar, as text | The display name belongs to the account and is written at `PUT /me`. The app has no client for it yet (also STOURIFY-307). A box that looks typable and isn't would be a trap. |
| Home city as a text box | A row of city chips | The server stores a city from the synced list, not free text. Typed text would have to be guessed back into a city. |
| No interests on Edit Profile | The interest chips stay | This work changed the look, not what you can edit. Removing them would take away the only place to change your interests. |
| The wishlist grouped by city ("General Santos · 4 spots") | One list | A spot has no city field, only a free-text address. Guessing a city from an address would put spots under the wrong heading. |
| "Download offline" on each group | Not drawn | There are no offline map or spot packs. |
| A distance on each saved spot ("3.2 km") | The address instead | This screen has no position. Asking for location just to decorate a list isn't worth the permission prompt. |
| An unsave button on each saved spot | Not drawn | The server has `DELETE /wishlist/{id}`, but unsaving is a new action with its own offline behaviour, not a new look. That's STOURIFY-303. |
| A map button on the Wishlist's back bar | Not drawn | Saves have no map view to switch to. |
| A Follow / Following button on every follower row | Not drawn | A follow row doesn't say whether *you* follow that person. Asking the server once per row is the slow one-request-per-row pattern STOURIFY-260 rejected. |
| Labels like "Trailblazer" under each name | "@username" only | Explorers have no ranks. |

## Two things that were added, not taken away

- **"See all" on your profile's Wishlist tab.** When STOURIFY-288 turned the old "Saved spots"
  button into a tab, nothing opened the Wishlist screen any more. The link is the way back in.
- **"This list is private".** The old Followers screen showed an empty list when a private account
  refused to share it, which read as "they have no followers". The server's answer there (a 403)
  means *you may not see this*, so the screen now says that, and offers no retry that could never
  work. Any other failure offers "Try again".

## Where the follow screen gets its numbers

The switch reads like "12 Followers" and "7 Following". Those numbers come from the profile you
opened the list from, under the same cache key the profile screen uses, so arriving from a profile
costs no extra request. Counting the rows instead would mean fetching both lists just to label the
switch. Until that profile has answered, the switch reads plain "Followers" and "Following".

Search works on the list that is already loaded, on the phone, so it is instant and works in
airplane mode. It matches a name or an @username. A server-side search is worth adding only once a
list is longer than its first page.

> **Lesson.** A design canvas shows how a screen should *feel*. It isn't a list of what exists.
> Before you build a button, find the thing it will call. If there's nothing to call, leave the
> button out and write down why.
