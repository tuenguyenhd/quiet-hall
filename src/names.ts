// Auto "degen" names for signed-in players: suggested on the welcome card until they type their own.
// Only letters, numbers and spaces, so they always pass cleanPlayerName (no dots or symbols).
const FIRST = ['Based', 'Comfy', 'Giga', 'Diamond', 'Paper', 'Sleepy', 'Moon', 'Rekt', 'Wagmi', 'Ngmi', 'Pumped', 'Smol', 'Turbo', 'Ser', 'Anon', 'Chill', 'Lucky', 'Degen'];
const SECOND = ['Ape', 'Frog', 'Doge', 'Whale', 'Shrimp', 'Pepe', 'Chad', 'Fren', 'Wojak', 'Bonk', 'Shibby', 'Capy', 'Monk', 'Kitty', 'Hodler', 'Gremlin', 'Goblin', 'Bull'];

/** e.g. "Comfy Frog 42" */
export function degenName(rand: () => number = Math.random): string {
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  return `${pick(FIRST)} ${pick(SECOND)} ${10 + Math.floor(rand() * 90)}`;
}
