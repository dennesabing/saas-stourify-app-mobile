# What the sign-in screens leave out, and why

**Who this is for:** anyone comparing the app's signed-out screens with the Auth & Entry design
(`docs/design/Stourify - Auth & Entry.dc.html` in the root repo) and finding a difference. It says
which differences are deliberate, why each one is, and what would have to change before it could go
away. Built under STOURIFY-286.

## The short version

A film set can show a door that opens onto nothing. That is fine for the film, because nobody walks
through it. The Auth & Entry canvas is a clickable prototype, and a few of its doors open onto
nothing: the buttons look real, but no server stands behind them. The app draws a screen only when
something real happens when you use it.

| On the canvas | In the app | Why |
|---|---|---|
| Continue with Google, Apple, Facebook | Not drawn | The server has no social sign-in: no Socialite, no OAuth routes. Apple sign-in was deferred with iOS on 2026-07-29. |
| VERIFY — a 6-digit email code | Not drawn | The platform confirms an email with a **web link** (`verify-email/{id}/{hash}` in `saas-boilerplate/routes/web.php`). No API accepts a code from the app, so a code screen would be a dead end. |
| DONE — "You're all set" | Not drawn | After sign-up the app goes straight into onboarding, whose progress bar already says what comes next. A screen that only says "next" adds a tap and tells you nothing. |
| Welcome over a beach photo | The brand gradient, with the canvas's navy fade kept | The app ships no photos. A hotlinked stock photo shows a blank page offline, which is exactly when a new user may first open the app. |
| Three pager dots on Welcome | Not drawn | There is one Welcome page. Dots promise more. |
| A shimmer bar on Splash | A spinner | Splash is a gate that lasts as long as reading the stored sign-in takes, usually under a second. A looping animation there buys little, and it would leave a timer running in every test that renders the navigator. |
| "We sent a reset link to you@email.com" | "If an account exists for you@email.com, we've sent it a reset link." | `/forgot-password` answers the same way for every address on purpose. Saying "we sent it" would tell a stranger which addresses have accounts. |

## Differences that add something

- **Sign up keeps Name and Confirm password.** The canvas draws Email and Password only. But the
  server's `RegisterRequest` requires `name`, and its password rule is `confirmed`, which needs
  `password_confirmation`. Dropping either field would make every sign-up fail. The Invitation code
  field still appears whenever `GET /auth/config` says sign-up is invitation-only.
- **Forgot password keeps "I have a reset code".** The app's reset flow asks for the code from
  the email, then a new password. The canvas doesn't draw that screen (`ResetPasswordScreen`), so
  it borrows the Forgot look: a tile, a title, and the large fields.

## The strength meter is a scale, not a bouncer

The bars under Sign up's password tell you how you're doing and never stop you. Sign-up is never
blocked on them, and the server's own password rule is the only thing that can refuse a password.
The rule lives in `passwordStrength()` in `src/features/auth/components/PasswordStrength.tsx`:

- Under 8 characters is **weak**, whatever it contains. That's the server's minimum.
- From 8 up, each kind of character used (lowercase, capitals, digits, symbols) scores a point, and
  a length of 12 or more scores one more. One point is weak, two is **good**, and three or more is
  **strong**.

The prototype scored length alone: nine characters counted as "strong", so it rated `aaaaaaaaa`
strong. Variety is what makes a password slow to guess, so variety counts here.

> **Lesson.** A prototype shows how a screen *feels*; it is not a list of what exists. Before you
> build a button, find the thing it will call. If there's nothing to call, leaving the button out
> is the honest version of the design.

## Where the pieces live

- `src/features/auth/components/`: the backdrop (`HeroBackdrop`), the form frame and heading
  (`AuthScreen`), the "New to Stourify? Sign up" line (`AuthPromptLink`), the strength meter, and
  `useScreenFocused`. That hook keeps Welcome's white status-bar icons from staying behind on
  Log In.
- `src/shared/components/ui/BackButton.tsx`: the round back button, shared with `BarHeader`.
- `src/shared/components/ui/Input.tsx` → `icon` and `size="lg"`: the canvas's field.
- `src/theme/tokens.ts` → `hero*` and `successBg`. The brand gradient has a deeper set in the dark
  palette, because the canvas is drawn in light only.

What would bring each missing piece back: a social-auth backend for the buttons; a code-issuing
verification API plus a deep link for VERIFY; a bundled, licensed photo for Welcome.
