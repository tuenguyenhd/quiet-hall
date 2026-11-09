# Spec 004: Online join reliability

## Why
Growth depends on "open link, see people, sit together". It must work for many people at once, through
invite links, after phone sleep, and across the main and Seeker halls.

## User stories
1. **Join and see others (P1).** Two or more people opening the link see each other within 2 s, with
   correct "here · sitting" counts.
2. **Invite link (P1).** A friend opening `/?with=<id>` appears next to the host; host is told; invite counts
   unique friends only.
3. **Sit counts (P1).** Sitting and standing update everyone's counts; minutes today persist.
4. **Reconnect (P2).** If the connection drops (phone sleep), the client reconnects and restores its sit state.
5. **Crowd (P2).** 30 simulated visitors moving at once keep message rate and latency acceptable.
6. **Seeker hall gating (P2).** Anonymous visitors cannot join the Seeker hall.
7. **Abuse limits (P3).** More than 8 connections from one IP are refused; message floods are dropped.

## Acceptance
- `scripts/online-test.mjs` passes against local dev and the live Worker.
- Two real browsers (Mac + phone) see each other on https://quiet-hall.vercel.app. **[device]**
