# What the sync cycle did on a stuck reconnect

**For:** anyone picking up STOURIFY-220, or anyone about to design a repair for the offline queue
failing to send itself after the phone comes back onto the network.

**Short answer, and it is an honest disappointment: the fault did not appear.** Twenty airplane-mode
reconnects on the physical handset, with an instrumented build that would have recorded exactly what
happened, and all twenty worked. So this page cannot tell you which line the stuck cycle stops at.

What it *can* tell you is what a healthy reconnect looks like from the inside, in a level of detail
nobody has had before, and it hands the next attempt an instrument that is already built and already
proven on hardware. Read it before spending another session on this bug.

## Where this sits in the story

The bug is that the app sometimes does not send its queued work after the network comes back.
Attempts one through four assumed the app never noticed the network return. STOURIFY-134 measured
that on hardware and found the opposite: in the one round that failed, the app's connectivity flag
recovered correctly, read `online` twelve more times, and **not one request of any kind reached the
backend for sixty seconds**. The driver heard that the road had reopened and did not start the van.

That put the fault somewhere between "the app knows" and "a request goes out" — a stretch of code
with one latch and five ways to end early, all of which look identical from outside because all of
them produce silence. STOURIFY-220 was split out to build something that can tell them apart, and to
run the protocol until the fault appeared again.

Half of that is done.

## The instrument

`src/sync/trace.ts`, switched on by building with `EXPO_PUBLIC_SYNC_TRACE=1`, off in every ordinary
build. It writes one line to the phone's log for each of:

- every network reading the app receives, and whether the seam treated it as a change;
- the connectivity edge and the foreground edge firing in the scheduler;
- every entry to a sync cycle, every step inside it, and every reason it ends;
- a cycle turned away because another already holds the latch — **naming the holder and how many
  milliseconds it has been sitting there.**

That last line is the one built for the leading hypothesis. If a cycle left over from the offline
period is stuck waiting on a socket that will never answer, the reconnect cycle's skip line says
`held=` and a large number, and the argument is over in one reading.

[`instrumenting-a-sync-cycle.md`](instrumenting-a-sync-cycle.md) is the operating manual.

## The run

| | |
|---|---|
| Device | Samsung Galaxy S22 Ultra, `SM-S908E`, Android 14, serial `R5CTA0KGBFL`, over **USB** |
| Date | 2026-08-28 |
| Build | `releaseDev`, SHA-256 `7bfa7eb7bacc3374188a4c07f58fddaf1b5f9b5b3745d6146b422690f13e0566` — the installed package hashed to the same value, so the phone was running the file that was built |
| Backend | PHP's built-in server on `0.0.0.0:8000`, reached at this machine's LAN address `192.168.68.232`, baked into the APK at build time |
| Phone's VPN | **up** throughout, untouched — its normal state on this handset |
| Rounds | 20 |

One round, unchanged from the protocol in
[`does-the-vpn-explain-the-stuck-offline-flag.md`](does-the-vpn-explain-the-stuck-offline-flag.md):
force-stop the app, relaunch it, let it settle for twenty seconds, airplane mode on for fifteen
seconds, airplane mode off, then touch nothing for sixty seconds while the backend's request log is
watched. Clean means an unprompted `GET /api/v1/stourify/sync/delta` arrives inside that minute.
Stuck means nothing arrives at all.

## The result

**Twenty rounds, twenty clean, zero stuck.**

| | |
|---|---|
| Rounds where the connectivity edge fired | 20 of 20 |
| Rounds where a cycle started on that edge | 20 of 20 |
| Delay from the edge to the cycle starting | **0–1 ms**, every round |
| Cycle duration, start to finish | 8.3 – 12.3 s |
| Cycles turned away with `reason=in-flight` | **0** |
| Cycles that started and never finished | **0** |

Running total across every session on this handset: **58 clean rounds and 4 stuck**, so about one
round in fifteen, and none of the four happened while anything was watching the inside of the cycle.

## What a healthy reconnect looks like

Round 1, read straight off the phone. It is worth reading once, because it is the shape every
future stuck round will be compared against:

```
20:46:50.248  seam netinfo type=wifi conn=true reach=false next=false edge=yes   <- airplane mode on
20:46:50.248  scheduler connectivity edge online=false stopped=false
20:46:50.248  seam netinfo type=vpn  conn=true reach=false next=false edge=none
20:47:06.973  seam netinfo type=vpn  conn=true reach=true  next=true  edge=yes   <- the network is back
20:47:06.973  scheduler connectivity edge online=true stopped=false
20:47:06.973  cycle#1 enter trigger=connectivity
20:47:06.973  cycle#1 drain start
20:47:06.975  cycle#1 drain done attempted=0 acked=0 rejected=0 fullyAcked=true networkFailure=false
20:47:06.975  cycle#1 pull start
20:47:16.328  cycle#1 pull done rows=0 networkFailure=false error=none
20:47:16.334  cycle#1 exit reason=ok rows=0
20:47:16.335  cycle#1 media start
20:47:16.339  cycle#1 media done
20:47:16.339  cycle#1 post-outbox start
20:47:16.340  cycle#1 post-outbox done
20:47:16.340  cycle#1 end elapsed=9367ms
```

Two things in there are useful even though the round passed.

**The edge and the cycle share a timestamp.** There is no queue, no debounce and no delay between
the app deciding it is online and a cycle beginning. So on a stuck round, an `enter` line that is
missing means the scheduler was never called, and an `enter` line that is present means the problem
is inside the cycle. There is no third possibility left to argue about.

**The nine seconds are the pull, not the app hesitating.** `drain done` to `pull start` is two
milliseconds; `pull start` to `pull done` is nine seconds. That is the delta request crossing the
VPN tunnel to a machine in the same room and back — the tunnel routes the local subnet out to a
server on the public internet, which is the cost recorded in the earlier document. Do not read a
long cycle as evidence of anything on its own.

## What this does and does not settle

**Settled:** the instrument works on real hardware, the flag gates it correctly, and the trace is
readable. Twenty rounds of it cost about thirty-five minutes unattended, so the next reproduction
attempt is now cheap.

**Not settled — and nobody should write it down as if it were:** why the reconnect sometimes sends
nothing. Twenty clean rounds are not evidence that the bug is gone. The fault has always been rare,
this session's build changed no behaviour, and a run that does not reproduce an intermittent fault
tells you about the run, not about the fault.

**Still untested, exactly as untested as before:** the in-flight-latch hypothesis. Zero skip lines
were recorded across twenty rounds, which is what you would expect on twenty rounds where nothing
went wrong; it says nothing about what happens on the round where something does.

## What to do next, and what not to

**Do:** run the same protocol again with this build, for longer. The instrument is installed and the
recipe is two documents. Sixty rounds is about ninety minutes of unattended airplane cycling, and at
one in fifteen it is very likely to catch one.

**Do:** consider running it with the phone's VPN switched off as well. It is not the cause — that was
settled by STOURIFY-134 — but the two arms are the only variation anybody has tried, and each arm
has produced a failure at some point.

**Do not** design a repair off this page. It contains no failing round. That is the whole reason the
card that produced it was split out of its parent: four attempts have now been spent designing
against a diagnosis nobody had measured, and one of those designs was merged on a gate that had read
red and had to be reverted the next day.

**Do not** re-run the VPN comparison as a comparison. It has been run and the answer is in the other
document.
