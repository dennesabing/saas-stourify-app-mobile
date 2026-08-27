# Does the phone's VPN explain the stuck-offline flag?

**For:** anyone picking up STOURIFY-134, or anyone about to design a repair for the offline queue
failing to drain after a reconnect.

**Short answer: no, and the experiment produced something better than a yes.** Switching the
handset's always-on VPN off did not stop the fault — it is the arm the fault appeared in. And when
it appeared, the diagnostic log showed the app doing something nobody had predicted: **the
connectivity flag recovered correctly and the sync still never happened.** That contradicts the
explanation this card has carried since it was filed.

Read this before running another airplane-mode session, so the same twenty rounds are not paid for
twice.

## Why the VPN was suspected

Two runs on the same phone, against code that is byte-identical in this area, disagreed completely:

| Date | Rounds | Result |
|---|---|---|
| 2026-08-25 | 5 | 3 stuck — the report this card is built on |
| 2026-08-27 | 18 | all clean |

The one condition anybody had *named* that differed between them was not really a difference at
all: a WireGuard tunnel called `homelab` had been up on the handset the whole time, and nobody had
noticed. It mattered because every "the phone was healthy" measurement in the failing run — `ping`,
a `401`, a `204`, Android's `VALIDATED` flag — had been taken on the Wi-Fi interface, while the app
was sitting on the tunnel. So the healthy-phone evidence was about the wrong road.

The tunnel also carries a real cost that makes it a plausible suspect. It is configured to route
`192.168.68.0/24` — the local network the test backend sits on — through the tunnel, whose endpoint
is a server on the public internet. A request from the phone to a machine in the same room
therefore leaves the building, crosses the internet and comes back. Measured on 2026-08-28:

```
tunnel up:    ping 192.168.68.232  ->  123-205 ms
tunnel down:  ping 192.168.68.232  ->   17-26 ms
```

Roughly seven times slower for a round trip across a single room. If a timeout somewhere were the
cause, that is exactly where it would show.

## The experiment

Twenty rounds on `R5CTA0KGBFL` (Samsung SM-S908E, Android 14), ten with the tunnel up and ten with
it down, on 2026-08-28. Everything else held identical.

**One round:** force-stop the app, relaunch it, let it settle for twenty seconds, turn airplane
mode on for fifteen seconds, turn it off, then touch nothing for sixty seconds while the backend's
own request log is watched.

- **Clean** = an unprompted `GET /api/v1/stourify/sync/delta` arrives inside those sixty seconds.
- **Stuck** = nothing arrives at all.

**The instrument** was the diagnostic build already installed — SHA-256
`583b236589c474ce0c9f009e2505ea1af0cf88b1047d3445fbb39338809332f2`, from `mobile` branch
`STOURIFY-134/netinfo-refresh-instrumentation` at `7bc8f9c`. It writes one line to Android's log
under the tag `S134` for every network reading the app receives. Its first five minutes after each
launch are observe-only — it asks the phone nothing — so every round ran against behaviour
identical to `master`. The hash was checked before the first round and after the last, and did not
change.

The backend was PHP's own built-in server bound to `0.0.0.0:8000` and reached at this machine's LAN
address. Its request log is the measuring instrument, which is why `php artisan serve` is not used:
it does not flush those lines when its output is captured rather than shown in a terminal, so a
scripted run cannot tell "nothing was sent" from "nothing was logged".

## Results

| Arm | Tunnel | Rounds | Clean | Stuck | Delay to sync, when clean |
|---|---|---|---|---|---|
| A | up | 10 | 10 | 0 | 5–7 s |
| B | **down** | 10 | 9 | **1** | 5–6 s |

**The VPN is not the variable.** The arm with the tunnel switched off is the arm that failed. Ten
clean rounds with it up is the same answer the previous session got in eighteen.

Across every session on this handset the running total is now 38 clean rounds and 4 stuck ones —
about one in ten — which is enough to say the fault is real and rare, and not enough to make it
happen on demand.

## What the stuck round actually showed, and why it changes the diagnosis

This is the part worth carrying forward. Round 6 of arm B, read straight from the `S134` log:

```
03:21:57.343  event type=wifi     conn=true  reach=false  seam=OFFLINE   <- airplane mode on
03:21:57.343  event type=none     conn=false reach=false  seam=OFFLINE
03:22:13.912  event type=cellular conn=true  reach=false  seam=OFFLINE   <- radios coming back
03:22:14.105  event type=wifi     conn=true  reach=false  seam=OFFLINE
03:22:14.392  event type=wifi     conn=true  reach=true   seam=online    <- the flag RECOVERS
03:22:14.392  event type=cellular conn=true  reach=true   seam=online
03:22:19 … 03:23:20   tick … flag=online   (twelve more readings, all online)
```

The app knew it was back. The flag went `false` → `true`, which is precisely the edge
`startSyncScheduler` listens for. And in the sixty seconds that followed, **not one request of any
kind reached the backend** — no `sync/push`, no `sync/delta`, nothing.

Compare that to what this card has said since it was filed: *the connectivity flag latches at
offline, so the regain edge never fires*. In this reproduction the flag did not latch and the edge
did fire. Whatever is broken is **downstream of the flag**, not the flag itself.

That is a genuinely different problem, and it explains something the original design work never
could: the reverted fifteen-second re-probe was aimed at un-sticking a flag, and on the handset it
changed nothing. It was repairing a mechanism that was not the one failing.

**What was not established.** This one round does not say *what* downstream. The scheduler's cycle
holds a lock so that two cycles cannot overlap, and a cycle left in flight from the offline period
would make the new one return "already running" and send nothing — that is the obvious first
hypothesis and it is untested. Neither the queue's contents nor the app's own sync screen were read
during that round, because the protocol deliberately keeps hands off the phone. Both are cheap to
add next time.

## What to do next, and what not to

**Do:** aim the next investigation at the sync cycle, not the connectivity seam. Instrument
`runSyncCycle` to log every entry, every early return and the reason for it, then run this same
protocol until a stuck round appears — about one round in ten, so budget twenty.

**Do not** re-run the VPN comparison. It has been run and the answer is in the table above.

**Do not** ship a repair to `mobile/src/sync/seams/connectivity.ts` on the strength of the original
diagnosis. It has now been contradicted by direct observation, and a repair aimed at it has already
been merged once, on a gate that had measured red, and reverted the next day.

## Reproducing this yourself

The protocol is a shell loop with `adb`; nothing here needs a rebuild.

```bash
adb -s <serial> shell am force-stop com.zivsluck.stourify
adb -s <serial> shell am start -n com.zivsluck.stourify/.MainActivity
sleep 20
adb -s <serial> shell cmd connectivity airplane-mode enable
sleep 15
adb -s <serial> shell cmd connectivity airplane-mode disable
# then watch the backend's request log for 60 seconds, touching nothing
adb -s <serial> logcat -d | grep S134 | tail -40
```

Two practical notes. Attach the phone over **USB**, not wireless debugging — airplane mode kills a
wireless link and takes your view of the device with it. And keep the screen awake with
`adb shell svc power stayon usb`, remembering to put it back with `svc power stayon false`.
