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
address, **started through the request-logging router script described in the next section**. Its
request log is the measuring instrument, which is why `php artisan serve` is not used: it does not
flush those lines when its output is captured rather than shown in a terminal, so a scripted run
cannot tell "nothing was sent" from "nothing was logged".

## Starting the backend so that it actually logs

**Read this before anything else. Get it wrong and every round of the protocol reports the fault.**

A referee who cannot see the goal line records every shot as a miss, and the score sheet looks
completely normal. That is the shape of the trap here. This whole protocol reads one thing to
decide clean from stuck — did a request reach the backend — and **a stuck round is an empty log**.
So anything that silences the log turns every round into a false failure, and produces a page of
evidence that looks overwhelming.

**Two runs on this machine disagree about whether the plain server logs at all, and that
disagreement is the reason for everything below.** The STOURIFY-220 run recorded PHP's built-in
server printing only `Accepted` and `Closing` for each socket, never a method and a path, and
worked around it with a router script. A later measurement on the same host, under STOURIFY-223,
could not reproduce that: started plainly, with output to a file and through a pipe, and with the
client hanging up early, the server printed a proper `[401]: GET /api/v1/…` line every time.

Nobody has explained the difference, and that is exactly why **the log is treated as a suspect
rather than a witness**: two careful readings of the same instrument disagree, so trusting either
report is a guess. What follows does not settle the argument — it removes the need to have it.

The repository carries a small router script. `php -S` runs a router file on every request before
it does anything else, so the script prints one line and then hands the request straight on —
nothing about how requests are served changes. Two things it gives you that the server's own line
does not, both measured:

- **It logs on arrival, not on completion.** The server's own line is written after the response
  is finished; on this host that is two to three seconds later, and on a phone across the tunnel it
  was nearer nine. A round watched in real time therefore shows an arrived request as nothing at
  all for several seconds — the exact appearance of a stuck round.
- **It logs unconditionally, with a tag you can grep.** Every line starts `REQ`, so
  `grep REQ` is the whole reading, and the line does not depend on the application booting or the
  response ever completing.

**Start the backend like this, from the repository root:**

```bash
php -S 0.0.0.0:8000 -t saas-boilerplate/public scripts/php-server-request-log.php 2>&1 | tee /tmp/backend.log
```

Each request then appears as one line:

```
[2026-08-28 22:19:04] REQ 192.168.68.101 GET /api/v1/stourify/sync/delta
```

### Prove the log is alive before you count a single round

An instrument that cannot fail loudly is worse than no instrument, because you still write the
numbers down. So the first thing you do — before the first round, every session — is make one
request by hand and confirm a line appears:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8000/api/v1/stourify/sync/delta
```

**What you should see:** a `REQ … GET /api/v1/stourify/sync/delta` line in the server's output
within a second. The HTTP status does not matter here — a `401` is a perfectly good answer, because
the question is only whether an arriving request is visible.

**If no line appears, stop.** Do not run a round, and do not record anything: with a silent log the
protocol has no way to tell a working app from a broken one, and every result it produces will say
"stuck". Check three things in this order — that you passed the router script as the last argument
to `php -S`, that you are reading the server's own output rather than `storage/logs/laravel.log`,
and that `bash scripts/tests/test-php-server-request-log.sh` passes, which starts a server through
the script and asserts the line for you.

**And if it does appear, you have also just settled the disagreement above for your session**,
which is the point of doing it every time rather than reading somebody's account of what the server
did last month.

Then repeat the same check **from the phone**, once, before the first round:

```bash
adb -s <serial> shell am start -a android.intent.action.VIEW \
  -d "http://192.168.68.232:8000/api/v1/stourify/sync/delta"
```

That opens the phone's browser at the backend, which is enough to produce a line; close the tab
afterwards. Android does not ship `curl`, which is why this goes through the browser rather than a
one-line shell command.

A line from the machine proves the log works; a line from the handset proves the phone can reach
this machine at all. Those are different failures, and on a session where the Wi-Fi network or the
tunnel has changed, the second is the one that bites.

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

**Step zero, and it is not optional: start the backend through the router script and prove the log
is alive**, exactly as *Starting the backend so that it actually logs* above sets out. A silent log
turns every round below into a false "stuck", so a session that skips this check produces results
that are worse than none.

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
