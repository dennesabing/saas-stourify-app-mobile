# Sixty reconnect rounds with the sync trace on

**For:** anyone picking up the long-running bug where the app comes back onto the network and sends
nothing, and anyone about to decide how much more measurement is worth buying.

**Short answer: sixty reconnects, sixty of them worked. The fault did not appear.** That is a
failure to reproduce, and it is written down here as one. Nothing about the bug is settled, nothing
is fixed, and no repair was designed.

What the run *does* establish is a number. The fault is now measured at **4 stuck rounds in 123**
across every session on this handset — about one in thirty — which is half as common as the
one-in-fifteen everybody has been planning against. That changes what the next attempt should be,
and the last section says how.

## Where this sits in the story

Three cards, in order, each doing one thing:

- **STOURIFY-134** ran the protocol with the phone's VPN off and on. It cleared the VPN as the
  cause, and — far more importantly — caught one stuck round on camera and found that the app's
  connectivity flag had recovered perfectly while nothing left the phone. That killed the diagnosis
  four earlier attempts had been built on.
- **STOURIFY-220** built an instrument that can see inside the sync cycle, then ran twenty rounds
  and caught nothing.
- **STOURIFY-221**, this one, ran sixty more. Same result.

## The run

| | |
|---|---|
| Device | Samsung Galaxy S22 Ultra, `SM-S908E`, Android 14, serial `R5CTA0KGBFL`, over **USB** |
| Date | 2026-08-28 |
| Build | `releaseDev` with `EXPO_PUBLIC_SYNC_TRACE=1`, SHA-256 `a5746c3eff6127e8728c2bad27122048b82b5f4f47d1c3a8d11667774932c70c` — the installed package hashed to the same value on the device, so the phone was running the file that was built |
| Backend | PHP's built-in server on `0.0.0.0:8000` behind `scripts/php-server-request-log.php`, reached by the phone at `192.168.68.232` |
| Phone's VPN | **up** throughout, untouched, and confirmed carrying traffic — a ping from the phone to this machine took 148 ms against 17–26 ms without the tunnel |
| Rounds | **60** |
| Result | **60 clean, 0 stuck** |

One round, unchanged from the protocol in
[`does-the-vpn-explain-the-stuck-offline-flag.md`](does-the-vpn-explain-the-stuck-offline-flag.md):
force-stop the app, relaunch it, let it settle for twenty seconds, airplane mode on for fifteen
seconds, airplane mode off, then touch nothing for sixty seconds.

**The verdict was taken twice, on two different tests, and both agree.** The loop's own test was
"did any request arrive in that minute". Afterwards every round was re-checked against the stricter
question — "did a `sync/delta` request arrive in that minute" — because the app also calls
`/api/v1/feed` and a feed call is not the thing being measured. All sixty rounds pass the stricter
test too.

### What the trace recorded

| Measurement | Over sixty rounds |
|---|---|
| A connectivity edge saying the network came back | 60 of 60 |
| A sync cycle entered on that edge | 60 of 60 |
| Time from the edge to the cycle starting | **0–1 ms** (mean 0.17 ms) |
| Cycles turned away with `reason=in-flight` | **0** |
| Cycles that started and never finished | **0** — 60 `enter` lines, 60 matching `end` lines |
| Cycle duration | 8.3 – 20.1 s, mean 9.6 s |
| Sign-out records (`S214`) | **0** |

The nine-second typical cycle is almost entirely the delta request crossing the VPN tunnel and
coming back, which is the same figure the previous session measured.

One round in full, exactly as it came off the device — this is round 60, and every other round has
the same shape:

```
13:45:19.188  scheduler appstate active->active foreground=false stopped=false
13:45:19.192  seam netinfo type=wifi conn=true reach=true next=true edge=none
13:45:41.687  seam netinfo type=wifi conn=true reach=false next=false edge=yes   <- airplane on
13:45:41.687  scheduler connectivity edge online=false stopped=false
13:45:58.702  seam netinfo type=vpn conn=true reach=true next=true edge=yes      <- back
13:45:58.702  scheduler connectivity edge online=true stopped=false
13:45:58.702  cycle#1 enter trigger=connectivity
13:45:58.702  cycle#1 drain start
13:45:58.704  cycle#1 drain done attempted=0 acked=0 rejected=0 fullyAcked=true networkFailure=false
13:45:58.704  cycle#1 pull start
13:46:07.171  cycle#1 pull done rows=0 networkFailure=false error=none
13:46:07.177  cycle#1 exit reason=ok rows=0
13:46:07.184  cycle#1 end elapsed=8482ms
```

## What this does and does not tell you

**It does not mean the bug is fixed, understood, or less likely to happen to a user.** Nothing in
the app changed in this run. Every line added by STOURIFY-220 is a report, and no decision anywhere
reads one. A run of good luck is not a repair.

**It does narrow the rate.** Four stuck rounds have now been seen in 123 reconnects on this handset:

| Session | Rounds | Stuck |
|---|---|---|
| 2026-08-25 | 5 | 3 |
| 2026-08-27 | 18 | 0 |
| 2026-08-28 (VPN comparison) | 20 | 1 |
| 2026-08-28 (instrument's first run) | 20 | 0 |
| 2026-08-28 (this run) | **60** | **0** |
| **Total** | **123** | **4** |

One arithmetic caveat, since somebody will check it: the rows above the last one add to 63 rounds,
while STOURIFY-221's card body says the running total before this run was 62. They disagree by one,
and the disagreement is in records written before this run — it is reported here rather than quietly
picked over, because a tally nobody can reconcile is worse than a tally that is one out.

Three of the four failures came from one session of five rounds. Take that session out and the
remaining 118 rounds hold a single failure. Whatever the fault is, it is **not** evenly spread — it clusters,
and the cluster was two days before any instrument existed.

**It leaves the in-flight-latch hypothesis exactly where it was.** Zero skip lines across sixty
rounds is what sixty working rounds look like; it is not evidence against the hypothesis, because
the hypothesis only predicts a skip line on a round that fails.

**Two limits of the protocol worth stating plainly**, because they bound what any number of clean
rounds could prove:

- **The outgoing queue was empty in every round.** Every `drain done` line says `attempted=0`. So
  what these rounds test is whether a cycle *runs* after a reconnect, not whether a full queue
  drains. The original user-facing complaint was about queued work sitting unsent.
- **A cold start is not the only way in.** Each round force-stops and relaunches the app, so the
  reconnect always happens to a freshly started process. The one observed failure was in a round
  shaped the same way, so this is not a known gap — but it is an untested half of the space.

## What to do next, and what not to

**Do not run this protocol again unchanged.** That is the whole point of writing the rate down. At
one in thirty, another sixty rounds is a coin toss, and the last hundred rounds have cost three
sessions and produced one photograph.

**Do** consider making the fault more likely instead of waiting for it, and the honest way to say
that is: the three clustered failures came from the earliest session, so the useful question is what
was different about that day — a queue with work in it, a long offline period, a phone that had been
running for hours rather than freshly relaunched. Any of those is a change to the protocol, and a
protocol change is a card of its own.

**Do not** design a repair from this page. It contains no evidence about the mechanism, and that is
exactly the condition under which two of this bug's five attempts went wrong — one of them merged on
a gate that had measured red and was reverted the next day.

## One rig note, for whoever runs the next session

Half an hour of this run was thrown away because **two round loops drove the phone at once**. The
harness reported the first loop stopped; it had not stopped, and a second was started on the
strength of that report. From then on each loop was turning airplane mode off inside the other
loop's counting minute.

It was visible in the timing before it was visible anywhere else: a healthy round takes a steady
96 seconds, and the overlapping ones took 30 to 60. Rounds 39 to 45 were discarded and re-run.

So: **before starting anything that drives the handset, list the processes and look.** A completion
notification is a claim about a process, not the process itself — the same reason the checkout
witness exists.
