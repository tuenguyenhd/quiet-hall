# Tasks 004: Online join

Plan: one Node script (`scripts/online-test.mjs`) drives N WebSocket "bots" against any base URL and asserts
on the messages. No new server code unless a test fails.

- [x] T001 Write `scripts/online-test.mjs` with a tiny assert helper and a bot class
- [x] T002 Test: join → welcome lists existing players; others get `join` + correct `here`
- [x] T003 Test: sit/stand → `s` broadcast and `sitting` count; sit ≥ 15 s adds to `sits`
- [x] T004 Test: invite link → `friendHere` (position) to friend, `friend` (+count) to host; repeat friend not double counted
- [x] T005 Test: reconnect with `s: sit` in hello restores sitting
- [x] T006 Test: Seeker room refuses anonymous visitor (`denied`)
- [x] T007 Test: 9th connection from one IP refused (local only; live IPs differ per bot runner)
- [x] T008 Test: crowd of 30 bots moving at 8 Hz for 10 s, report messages/s and p95 latency
- [x] T009 Run against local dev and live Worker; fix anything that fails
- [ ] T010 **[device]** Mac + Seeker on the live site see each other, invite link works from the share sheet
