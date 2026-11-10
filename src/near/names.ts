// Auto "degen" names for signed-in players, suggested on the welcome card until they type their own.
//
// The algorithm: a small grammar of crypto-meme templates ("{state} {meme}", "{meme} {role}", "{x} {meme}",
// "{meme} the {epithet}", "Ser {meme}", "{meme} wen {goal}") filled from word lists that always make sense
// together, so every name reads like a real CT handle ("Diamond Pepe", "Doge the Unrugged", "100x Bonk",
// "Kitty Wen Lambo") instead of three random words and a number.
// The meme is drawn from the player's fren (a Froggo gets Pepe / Frog names, a Shibu gets Doge / Bonk), so the
// name fits the character they walk around as. Only letters, numbers and spaces: always passes cleanPlayerName,
// and never looks like a wallet or a .near account. At most 16 characters: the hall's name limit (cleanPlayerName).

/** memes that fit each fren (welcome card species labels); unknown or "Degen" → any of them */
const MEMES: Record<string, string[]> = {
  froggo: ['Pepe', 'Frog', 'Froggo', 'Kek'],
  shibu: ['Doge', 'Shib', 'Bonk', 'Shibby'],
  kitty: ['Kitty', 'Popcat', 'Mew', 'Catcoin'],
  capy: ['Capy', 'Capybara'],
  monk: ['Monk', 'Zen Ape', 'Guru'],
  degen: ['Ape', 'Wojak', 'Chad', 'Pepe', 'Doge', 'Bonk', 'Anon', 'Fren'],
};
const ANY = [...new Set(Object.values(MEMES).flat())];

// each list is written to fit its template slot for every meme above
const STATE = ['Based', 'Rekt', 'Comfy', 'Giga', 'Down Bad', 'Diamond', 'Paperhand', 'Ported', 'Levered', 'Unrugged', 'Moonbound', 'Early', 'Bullish', 'Max Long', 'Exit Liq'];
const ROLE = ['Maxi', 'Whale', 'Jeet', 'Hodler', 'Sniper', 'Flipper', 'Degen', 'Minter', 'Shiller', 'Bagholder', 'Chartist', 'Farmer'];
const EPITHET = ['Unrugged', 'Based', 'Early', 'Patient', 'Rugless', 'Liquid', 'Top Signal', 'Undying'];
const MULT = ['10x', '100x', '1000x', '69x', '420x'];
const GOAL = ['Lambo', 'Moon', 'Airdrop', 'ATH', 'Pump'];

type Rand = () => number;
/** the hall's player-name limit (cleanPlayerName keeps 16 characters) */
const MAX = 16;
const pick = <T,>(a: readonly T[], r: Rand) => a[Math.floor(r() * a.length)];

/** the templates, each a function of a meme: weights repeat the ones that read best */
const TEMPLATES: ((m: string, r: Rand) => string)[] = [
  (m, r) => `${pick(STATE, r)} ${m}`,
  (m, r) => `${pick(STATE, r)} ${m}`,
  (m, r) => `${m} ${pick(ROLE, r)}`,
  (m, r) => `${m} ${pick(ROLE, r)}`,
  (m, r) => `${pick(MULT, r)} ${m}`,
  (m, r) => `${m} the ${pick(EPITHET, r)}`,
  (m) => `Ser ${m}`,
  (m, r) => `${m} Wen ${pick(GOAL, r)}`,
];

/**
 * A meaningful degen name, e.g. "Diamond Pepe", "Doge Maxi", "100x Bonk", "Mew the Undying".
 * `fren` is the fren the player picked (species label such as "Froggo"); the meme matches it when known.
 */
export function degenName(rand: Rand = Math.random, fren?: string | null): string {
  const pool = MEMES[(fren ?? '').trim().toLowerCase()] ?? ANY;
  for (let i = 0; i < 24; i++) {
    const n = pick(TEMPLATES, rand)(pick(pool, rand), rand);
    if (n.length <= MAX) return n;
  }
  return `Based ${pick(pool, rand)}`;
}
