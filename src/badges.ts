// Badges: earned (never bought), shown for 30 days, refreshed by earning again. Pure logic, unit-tested.

export const BADGE_DAYS = 30;
const DAY = 86400000;

export interface BadgeDef {
  id: string;
  name: string;
  icon: string;
  hint: string;
}

export const BADGES: BadgeDef[] = [
  { id: 'lake-stone', name: 'Lake Stone', icon: '🪨', hint: 'Sit 3 minutes at the lake' },
  { id: 'raked-ring', name: 'Touch Grass', icon: '🌱', hint: 'Sit 3 minutes in the Stone Garden' },
  { id: 'maple-leaf', name: 'Maple Leaf', icon: '🍁', hint: 'Sit 3 minutes in the Maple Grove' },
  { id: 'tea-cup', name: 'Tea Cup', icon: '🍵', hint: 'Sit 3 minutes in the Tea House' },
  { id: 'summit-pebble', name: 'Summit Pebble', icon: '⛰', hint: 'Sit 3 minutes at the Lookout' },
  { id: 'hall-bell', name: 'Hall Bell', icon: '🔔', hint: 'Ring the bell within 2 minutes of a group bell' },
  { id: 'world-sit', name: 'WAGMI Sit', icon: '🌍', hint: 'Sit during the daily World Sit' },
  { id: 'seven-days', name: 'Diamond Calm', icon: '💎', hint: 'Sit 7 days in a row' },
  { id: 'gathering', name: 'Frens', icon: '👥', hint: '3 friends join from your invite link' },
  { id: 'seeker-lotus', name: 'Seeker Lotus', icon: '🪷', hint: 'Sit as a verified Seeker owner' },
  { id: 'giver', name: 'Giver', icon: '💛', hint: 'Support the hall (a tip or any paid item)' },
];

const PLACE_BADGE: Record<string, string> = {
  lake: 'lake-stone',
  garden: 'raked-ring',
  grove: 'maple-leaf',
  tea: 'tea-cup',
  lookout: 'summit-pebble',
};

export type BadgeStore = Record<string, number>; // badge id -> earnedAt (ms)

export type BadgeEvent =
  | { type: 'sit'; place: string | null; seconds: number; worldSit?: boolean; seeker?: boolean }
  | { type: 'bell'; msSinceGroupBell: number }
  | { type: 'streak'; days: number }
  | { type: 'invites'; n: number }
  | { type: 'donate' };

export const isActive = (store: BadgeStore, id: string, now: number) =>
  store[id] !== undefined && now - store[id] < BADGE_DAYS * DAY;

export function daysLeft(store: BadgeStore, id: string, now: number) {
  return isActive(store, id, now) ? Math.max(1, Math.ceil((store[id] + BADGE_DAYS * DAY - now) / DAY)) : 0;
}

/** Which badges an event earns (ids). */
export function earnedBy(e: BadgeEvent): string[] {
  const out: string[] = [];
  if (e.type === 'sit') {
    if (e.seconds >= 180 && e.place && PLACE_BADGE[e.place]) out.push(PLACE_BADGE[e.place]);
    if (e.worldSit && e.seconds >= 60) out.push('world-sit');
    if (e.seeker && e.seconds >= 60) out.push('seeker-lotus');
  } else if (e.type === 'bell' && e.msSinceGroupBell >= 0 && e.msSinceGroupBell <= 120000) out.push('hall-bell');
  else if (e.type === 'streak' && e.days >= 7) out.push('seven-days');
  else if (e.type === 'invites' && e.n >= 3) out.push('gathering');
  else if (e.type === 'donate') out.push('giver');
  return out;
}

/**
 * Applies an event. Re-earning refreshes the 30 days.
 * Returns the badges that are NEW or were faded (worth a toast); silent refreshes are not returned.
 */
export function applyEvent(store: BadgeStore, e: BadgeEvent, now: number): string[] {
  const fresh: string[] = [];
  for (const id of earnedBy(e)) {
    if (!isActive(store, id, now)) fresh.push(id);
    store[id] = now;
  }
  return fresh;
}

export const badge = (id: string) => BADGES.find((b) => b.id === id);
