// Unit tests for badges, lantern rules and spot layout (spec 006). Run: node scripts/test-items.mjs
import { applyEvent, daysLeft, earnedBy, isActive } from '../src/badges.ts';
import { cleanName, stoneSpots, treeSpots, STONE_COUNT, TREE_COUNT, WISHES } from '../src/layout.ts';

let pass = 0, fail = 0;
const t = (name, ok) => { ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✘'} ${name}`); };
const DAY = 86400000;
const now = Date.UTC(2026, 10, 9, 12);

t('3 min at the lake earns Lake Stone', earnedBy({ type: 'sit', place: 'lake', seconds: 180 }).includes('lake-stone'));
t('2 min at the lake earns nothing', earnedBy({ type: 'sit', place: 'lake', seconds: 120 }).length === 0);
t('hall sit gives no place badge', earnedBy({ type: 'sit', place: 'hall', seconds: 600 }).length === 0);
t('World Sit (1 min) earns world-sit', earnedBy({ type: 'sit', place: 'hall', seconds: 60, worldSit: true }).includes('world-sit'));
t('Seeker sit earns seeker-lotus', earnedBy({ type: 'sit', place: null, seconds: 90, seeker: true }).includes('seeker-lotus'));
t('bell 90 s after group bell earns hall-bell', earnedBy({ type: 'bell', msSinceGroupBell: 90000 })[0] === 'hall-bell');
t('bell 3 min after group bell earns nothing', earnedBy({ type: 'bell', msSinceGroupBell: 180000 }).length === 0);
t('7-day streak earns seven-days', earnedBy({ type: 'streak', days: 7 })[0] === 'seven-days');
t('3 invites earns gathering', earnedBy({ type: 'invites', n: 3 })[0] === 'gathering');

const store = {};
t('first earn is announced', applyEvent(store, { type: 'sit', place: 'grove', seconds: 200 }, now).join() === 'maple-leaf');
t('re-earn while active is silent', applyEvent(store, { type: 'sit', place: 'grove', seconds: 200 }, now + DAY).length === 0);
t('active with 30 days left after refresh', daysLeft(store, 'maple-leaf', now + DAY) === 30);
t('still active on day 29 after refresh', isActive(store, 'maple-leaf', now + 30 * DAY));
t('faded after 31 days', !isActive(store, 'maple-leaf', now + 32 * DAY));
t('earning again after fading is announced', applyEvent(store, { type: 'sit', place: 'grove', seconds: 200 }, now + 40 * DAY).join() === 'maple-leaf');

const s1 = stoneSpots(), s2 = stoneSpots(), tr = treeSpots();
t(`${STONE_COUNT} stone spots`, s1.length === STONE_COUNT);
t(`${TREE_COUNT} tree spots`, tr.length === TREE_COUNT);
t('spots are deterministic', JSON.stringify(s1) === JSON.stringify(s2));
const minGap = (pts) => { let m = Infinity; for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) m = Math.min(m, Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z)); return m; };
t(`stones at least 0.7 m apart (${minGap(s1).toFixed(2)})`, minGap(s1) >= 0.7);
t(`trees at least 1.4 m apart (${minGap(tr).toFixed(2)})`, minGap(tr) >= 1.4);

t('name keeps letters/accents', cleanName('Nguyễn Anh') === 'Nguyễn Anh');
t('name strips links and symbols', cleanName('visit http://x.io <b>') === 'visit httpxio b');
t('name max 16 chars', cleanName('a'.repeat(40)).length === 16);
t('wishes are preset', WISHES.length >= 8);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
