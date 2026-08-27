# Watching what a sync cycle actually did

**For:** anyone chasing a report that the app "did not sync" — most of all the long-running one
where the phone is demonstrably back on the network and nothing leaves it.

**What this gives you:** a switch that makes the app narrate every sync cycle into the phone's log,
the recipe for a build that has the switch on, and how to read the result.

## Why it exists

Think of a delivery van that never left the depot. Asking the depot "did the parcel go?" gets you
one word — no — and that word is the same whether the driver was never told, or was told and found
the van blocked in, or set off and broke down at the gate. You cannot fix any of those until you
know which one it was.

A sync cycle is that van. `src/sync/cycle.ts` has one latch and five ways to end early, and from
outside every one of them looks the same: no request arrives at the backend. STOURIFY-134 measured a
reconnect on a real handset where the app's own connectivity flag correctly went `offline` →
`online` and then nothing reached the server for a full minute. Silence, with no way to tell which
silence it was.

The trace turns that silence into a sentence.

## Switching it on

One environment variable, read when the JavaScript bundle is built:

```
EXPO_PUBLIC_SYNC_TRACE=1
```

Unset — which is every ordinary build, including everything that reaches a user — the app writes
nothing. It is off for a reason: a shipped app that narrates its internals into the system log tells
anyone with a cable more than it was asked to, and the cost of the log line is paid on every network
change by everybody, to serve an investigation that happens about once a year.

### For a build that starts with no network (what the airplane-mode protocol needs)

The reconnect protocol cold-starts the app with the radios off, so the JavaScript has to be inside
the APK — that means the `releaseDev` variant. See
[`building-a-dev-release-apk.md`](building-a-dev-release-apk.md) for what that variant is and why it
exists.

From the repository root, in PowerShell:

```powershell
$env:EXPO_PUBLIC_SYNC_TRACE = '1'
$env:EXPO_PUBLIC_API_URL    = 'http://<your machine's LAN address>:8000/api/v1'
.\scripts\mobile-apk-builder.ps1 -ReleaseDev
```

Both values are baked into the bundle at build time, so set them **before** you build. The LAN
address matters because a real phone cannot reach `10.0.2.2` — that is the emulator's private name
for the host machine, and `mobile/.env` is left holding it so nothing in the repository has to be
edited for a handset run.

Then install and start a backend the phone can actually reach:

```bash
adb install -r mobile/android/app/build/outputs/apk/releaseDev/app-releaseDev.apk
cd saas-boilerplate && php -S 0.0.0.0:8000 -t public public/index.php
```

`php -S` rather than `php artisan serve`, and that is not a preference. Artisan's wrapper does not
flush its request log when its output is captured by a script instead of shown in a terminal, so an
automated run cannot tell "the app sent nothing" from "the log has not been written yet" — and
telling those apart is the entire measurement.

### For ordinary development

```bash
cd mobile && EXPO_PUBLIC_SYNC_TRACE=1 npx expo start --dev-client --port 8087
```

## Reading it

```bash
adb -s <serial> logcat -d | grep S220
```

Every line is `S220`, a time to the millisecond, then the event. A healthy cycle looks like this:

```
S220 03:22:14.402 seam netinfo type=wifi conn=true reach=true next=true edge=yes
S220 03:22:14.404 scheduler connectivity edge online=true stopped=false
S220 03:22:14.410 cycle#3 enter trigger=connectivity
S220 03:22:14.411 cycle#3 drain start
S220 03:22:14.980 cycle#3 drain done attempted=0 acked=0 rejected=0 fullyAcked=true networkFailure=false
S220 03:22:14.984 cycle#3 pull start
S220 03:22:19.221 cycle#3 pull done rows=0 networkFailure=false error=none
S220 03:22:19.223 cycle#3 exit reason=ok rows=0
S220 03:22:19.224 cycle#3 media start
S220 03:22:19.240 cycle#3 media done
S220 03:22:19.241 cycle#3 post-outbox start
S220 03:22:19.252 cycle#3 post-outbox done
S220 03:22:19.253 cycle#3 end elapsed=4843ms
```

**The one rule for reading it: every `enter` has an `end` carrying the same number.** An `enter`
with no matching `end` is a cycle that never came back, and the last phase line above it names the
step it is still sitting in.

Four lines tell you most of what you will want to know:

| Line | What it settles |
|---|---|
| `seam netinfo … edge=none` | The network library spoke and this reading was not treated as a change. Nobody downstream was called, and that is by design rather than a fault. |
| no `scheduler connectivity edge` line at all | Nothing told the app the network came back. The problem is upstream of the sync code entirely. |
| `cycle skip … reason=in-flight holder=… held=…ms` | The cycle was told to run and refused, because an earlier one still holds the latch. **`held=` is the number that matters** — a few hundred milliseconds is two triggers arriving together and is normal; tens of seconds means an earlier cycle is stuck. |
| an `enter` with no `end` | Confirms the above from the other side, and the last phase line says where it is stuck. |

## What it is not

It changes nothing. Every line is a report; no decision anywhere in the app reads any of it. That is
deliberate and it is the point — an instrument that quietly performs part of the repair it was built
to measure the absence of will always report that the repair was unnecessary.

It also only prints. It does not keep the lines anywhere the app itself can show them, so this is a
tool for somebody with a cable, not for a user reporting a problem from their kitchen.
