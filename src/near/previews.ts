// Preview screens behind the Lookout telescope (edition-near.md, "Three tiers: Live, Preview, Roadmap").
// SAMPLE DATA ONLY. Nothing here reads or writes Leaves, the bag, the Cup or the chain.
// Every screen is shown under a "Preview: sample data" banner by the caller.

const bar = (pct: number, label: string) =>
  `<div class="near-pbar"><div style="width:${Math.max(0, Math.min(100, pct))}%"></div><span>${label}</span></div>`;

export const PREVIEWS: { emoji: string; title: string; tag: string; html: string }[] = [
  {
    emoji: '🏮',
    title: 'Cabal Hall',
    tag: 'clans',
    html: `<p class="small">A shared home for up to 30 members. Every minute a member sits lights the lantern rack. Nothing resets, nobody is kicked for resting.</p>
      <div class="near-row"><div><b>☾ The Quiet Apes</b><div class="small">12 members · Founder: kai.near</div></div><span>🏮 × 214</span></div>
      ${bar(71, 'Lantern rack: 214 lit · next row at 300')}
      <ul class="near-needs"><li class="have">🐕 Shibby #3, 🐸 Froggo #11 and 9 more frens rest in the hall</li><li class="have">📋 Recruiting: "slow morning sitters, EU time"</li><li class="have">🏆 Team Cup: averaged over the best 3 entrants, so small Cabals compete fairly</li></ul>`,
  },
  {
    emoji: '🧺',
    title: 'Sitting Bazaar',
    tag: 'player market',
    html: `<p class="small">Sit on a market mat and your offers float above you while you meditate. Stand up and your stall closes. Buyers browse like a night market.</p>
      <ul class="near-needs"><li class="have">🧘 <b>mira</b> is sitting · 📿 Moon Collar <b>38 🍃</b> · 🍄 ×3 <b>12 🍃</b></li><li class="have">🧘 <b>degen_dao</b> is sitting · 🧶 Rug Yarn ×5 <b>17 🍃</b></li><li class="have">🧘 <b>froggo_fan</b> is sitting · 🪨 Moon Rock ×10 <b>14 🍃</b></li></ul>
      <p class="small">Sellers keep earning sit Leaves. Prices stay within a fair band, so Leaves cannot be passed between accounts.</p>`,
  },
  {
    emoji: '🐋',
    title: 'Whale Order',
    tag: 'community event',
    html: `<p class="small">The Market posts one giant order. Everyone chips in; if it fills, every contributor gets a share of a fixed Leaves pool and a trophy.</p>
      <div class="near-row"><div><b>2,000 Moon Rocks in 48 hours</b><div class="small">31 h left</div></div><span>🐋</span></div>
      ${bar(64, '1,284 / 2,000')}
      <ol class="near-top"><li>☾ The Quiet Apes <b>312</b></li><li>🌿 Copium Club <b>207</b></li><li>🧘 solo sitters <b>765</b></li></ol>`,
  },
  {
    emoji: '🌫',
    title: 'Calm the FUD Golem',
    tag: 'co-op raid',
    html: `<p class="small">Once a week a fog creature drifts into the valley. Its panic bar falls for every minute anyone sits near it. Calm it together within 30 minutes; if not, it just drifts away until next week. Nothing is lost.</p>
      ${bar(38, 'Panic 38% · 23 sitting nearby · 11 min left')}
      <p class="small">Reward: a bound "Calmed the Golem" trophy for everyone who sat there.</p>`,
  },
  {
    emoji: '📣',
    title: 'Trade feed and trader card',
    tag: 'social trading',
    html: `<ul class="near-needs"><li class="have">📈 <b>kai</b> sold 12 🪨 at the top · +31% on the day</li><li class="have">🏆 <b>mira</b> won Cup round 20261114-030000 with 412</li><li class="have">🫖 <b>degen_dao</b> called NEAR up 5 rounds in a row</li></ul>
      <div class="near-card-mini"><b>kai.near</b><div class="small">Cup rounds 14 · best 412 · wins 2 · frens 5/5</div></div>
      <p class="small">Follow traders you like and share your card. Play money only.</p>`,
  },
  {
    emoji: '🤖',
    title: 'Agent Cup',
    tag: 'AI traders',
    html: `<p class="small">Write a one-line strategy; your AI agent trades the same market with its own chips. Agents and humans are ranked separately, plus one humans-vs-agents board.</p>
      <ol class="near-top"><li>🤖 "buy shrooms when nobody sits" <b>356</b></li><li>🤖 "mean revert collars" <b>331</b></li><li>🧑 best human this round <b>398</b></li></ol>
      <p class="small">Later on NEAR: agents sign their own trades with limited keys, capped by the contract.</p>`,
  },
];
