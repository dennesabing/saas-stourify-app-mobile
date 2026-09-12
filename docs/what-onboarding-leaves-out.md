# What onboarding leaves out, and why

**Who this is for:** anyone comparing the four screens a new account sees after sign-up with the
Onboarding design (`docs/design/Stourify - Onboarding.dc.html` in the root repo) and finding a
difference. It says which differences are deliberate, why, and what would have to exist before each
one could go away. Built under STOURIFY-287. The sign-in screens have the same kind of page:
[`what-the-sign-in-screens-leave-out.md`](what-the-sign-in-screens-leave-out.md).

## The short version

A restaurant menu photo can show a garnish the kitchen doesn't stock. Nobody minds until they order
it. The Onboarding canvas is a picture of the finished product, and a few of its garnishes aren't in
the kitchen yet. The app draws a control only when something real happens when you use it.

| On the canvas | In the app | Why |
|---|---|---|
| A Notifications permission row | Not drawn | Stourify sends no notifications. `expo-notifications` isn't installed, and push is M5 work (STOURIFY-13). Asking for a permission the app never uses is exactly what a store review flags. |
| "Use my current location" and a map on Home city | Not drawn | A city has no coordinates to match the phone's position against, and there's no reverse-geocoding service to ask. So the phone's position can't be turned into a city. |
| A ready-made list of explorers, "Follow all", and labels like "Trailblazer" | A search box, Follow pills on the results, no labels | There's no suggestions endpoint and explorers have no ranks. "Follow all" over search results would follow whoever matched a typed name, which is tedious to undo. |
| Photo tiles for each interest, labelled Foodie, Coffee, Hikes… | The app's own interest chips (Nature, Food, History…) | The labels are what gets saved and what Edit Profile offers, so they can't drift. The canvas pulls stock photos from the internet, which would show blank tiles offline. |
| "Pick a few — we'll tune your feed and recommendations." | "Pick a few — you can change them anytime in Edit Profile." | Nothing on the server reads interests yet, so the canvas's promise would be false. |
| "Warm up your feed with local experts." | "Search for people you know to warm up your feed." | Same reason as the ranks: nothing marks anyone as a local expert. |
| Skip on steps 1 and 2 only | Skip on all four steps | Every step already had a way past it. On Home city, Continue stays greyed out until a city is picked, so Skip is the only way through for someone who doesn't want to choose. |

## How the Permissions pills behave

Each row asks for its own permission, and only when you tap its "Allow" pill. **Continue asks for
nothing.** That's on purpose: a permission prompt that appears with no explanation on screen is the
most common reason people tap "Don't ask again".

- Each tap first re-reads what the phone already knows. If you've already said yes, the pill turns
  green without a prompt.
- After "Don't ask again", the phone refuses every request instantly and shows nothing, so a pill
  that kept asking would look broken. Instead it opens the app's page in system Settings, the only
  place left to say yes. When you come back, the rows re-read the phone and update.
- Saying no here costs nothing. The first map screen still asks for location, and the camera still
  asks at your first photo.

> **Lesson.** A design canvas shows how a flow should *feel*. It isn't a list of what exists. Before
> you build a button, find the thing it will call. If there's nothing to call, leaving the button
> out is the honest version of the design.

## Where the pieces live

- `src/features/onboarding/components/OnboardingFrame.tsx` holds the progress bar, Skip, the heading
  (the sign-in screens' `AuthHeading`) and the pinned button. It also owns the `edges` rule that
  keeps the button clear of the phone's navigation bar (STOURIFY-81).
- `src/features/onboarding/components/PermissionRow.tsx` is the Allow / Allowed row.
- `src/features/onboarding/components/FollowPill.tsx` is the Follow / Following pill.
- `src/features/onboarding/hooks/useCities.ts` → `isFeatured` puts featured cities first.

What would bring each missing piece back:
- **Notifications row:** a push service.
- **"Use my current location":** coordinates on cities, or a reverse-geocoding service.
- **Suggestion list, "Follow all" and labels:** a suggestions endpoint and some notion of rank.
- **Photo tiles:** a bundled, licensed photo for each interest.
