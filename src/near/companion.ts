// AI companion sheet (NEAR edition): chat with Biscuit, your one pet, on NEAR AI Cloud. Biscuit also gives Market Cup
// trading tips from live prices. Free trial per day, then an AI Pass paid in testnet NEAR (src/companion.ts).
import { COMPANION } from '../companion';
import { POLICY, type Risk } from '../agents';

type Msg = Record<string, unknown> & { t: string };
export interface CompanionHost {
  send(m: Record<string, unknown>): void;
  show(html: string, kind: string): void;
  body(): HTMLElement;
  isOpen(kind: string): boolean;
  toast(text: string, ms?: number): void;
  /** pat the pet in the world when it answers */
  pat(): void;
  /** open the NEAR login (the autopilot and agent keys need one) */
  login(): void;
  loggedIn(): boolean;
}

interface AgentLog {
  at: number;
  action: string;
  item: string | null;
  units: number | null;
  total: number | null;
  why: string;
  by: string;
  ok: boolean;
}
const itemName = (i: string | null) => (i ?? '').split('_').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : '')).join(' ');
const ago = (t: number) => {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`;
};

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const KIND = 'companion';
const YOCTO_PER_NEAR = '000000000000000000000000';

export function setupCompanion(h: CompanionHost) {
  const log: { u: string; a: string }[] = [];
  let lines: { who: 'me' | 'pet' | 'sys'; text: string }[] = [
    { who: 'pet', text: `*wags tail* Hi, I'm ${COMPANION.name}. Tell me about your day, or tap 📈 for a Market Cup tip.` },
  ];
  let stat = { left: COMPANION.freePerDay as number, free: COMPANION.freePerDay as number, pass: 0, price: COMPANION.passNear as number, days: COMPANION.passDays as number, to: '' };
  let waiting = false;
  let pending = '';
  let needPass = false;
  let paying = false;
  let agent: {
    active: boolean; risk: Risk; position: { chips: number; bag: Record<string, number> } | null; log: AgentLog[]; keys: number; why?: string;
    wallet?: string; earned?: { badge: string; status: string; tx: string | null }[];
  } = { active: false, risk: 'calm', position: null, log: [], keys: 0 };
  let newKey: { key: string; mcp: string } | null = null;
  let poll = 0;

  const status = () =>
    stat.pass
      ? `✨ AI Pass active until ${new Date(stat.pass).toLocaleDateString()}`
      : `${stat.left} of ${stat.free} free chats left today`;

  function render() {
    if (!h.isOpen(KIND)) return;
    const b = h.body();
    const list = b.querySelector('#cp-log');
    if (list) {
      list.innerHTML = lines.map((l) => `<div class="cp-line cp-${l.who}">${esc(l.text)}</div>`).join('') + (waiting ? `<div class="cp-line cp-pet cp-typing">${COMPANION.name} is thinking…</div>` : '');
      list.scrollTop = list.scrollHeight;
    }
    b.querySelector('#cp-status')!.textContent = status();
    b.querySelector('#cp-pass')!.classList.toggle('hidden', !needPass || !!stat.pass);
    for (const el of b.querySelectorAll<HTMLButtonElement>('[data-cp]')) el.disabled = waiting;
    renderAgent();
  }

  /** Biscuit's autopilot panel and the "bring your own agent" key */
  function renderAgent() {
    const el = h.body().querySelector('#cp-agent');
    if (!el) return;
    const pos = agent.position;
    const posLine = pos ? `In the Cup: ${pos.chips} chips${Object.keys(pos.bag).length ? ' · ' + Object.entries(pos.bag).map(([k, n]) => `${n} ${itemName(k)}`).join(', ') : ''}` : 'Not in this Cup round yet: Biscuit joins for you.';
    el.innerHTML = `
      <div class="cp-agent-head"><b>🤖 Let Biscuit trade for you</b>
        <button class="chip ${agent.active ? 'on' : ''}" id="cp-auto">${agent.active ? 'ON' : 'OFF'}</button></div>
      <p class="small">Biscuit trades your Market Cup entry every few minutes, with a reason for each move. Its trades move prices like anyone's.</p>
      <div class="chips">${(['calm', 'bold'] as Risk[]).map((r) => `<button class="chip ${agent.risk === r ? 'on' : ''}" data-risk="${r}">${r === 'calm' ? '🐢 Calm' : '🔥 Bold'}</button>`).join('')}</div>
      <p class="small">${esc(POLICY[agent.risk].label)}, max ${POLICY[agent.risk].maxChipsPerTrade} chips per trade.${agent.active ? ' ' + esc(posLine) : ''}</p>
      ${agent.wallet ? `<p class="small">👛 Biscuit's own NEAR wallet: <code>${esc(agent.wallet.slice(0, 8))}…${esc(agent.wallet.slice(-6))}</code>${agent.earned?.length ? ` · earned: ${agent.earned.map((e) => (e.tx ? `<a href="https://explorer.testnet.near.org/transactions/${esc(e.tx)}" target="_blank" rel="noopener">${esc(e.badge)} ↗</a>` : `${esc(e.badge)} (${esc(e.status)})`)).join(', ')}` : ' · a profitable round earns it a receipt on NEAR'}</p>` : ''}
      ${agent.why ? `<p class="small near-err">${esc(agent.why)}</p>` : ''}
      ${agent.log.length ? `<ul class="cp-trades">${agent.log.slice(0, 6).map((l) => `<li class="${l.ok ? '' : 'no'}"><span>${l.action === 'hold' ? '⏸' : l.action === 'buy' ? '🟢 Bought' : '🔴 Sold'} ${l.action === 'hold' ? '' : `${l.units} ${esc(itemName(l.item))}`}</span> <i>${esc(l.why)}</i> <small>${l.by === 'biscuit' ? '🐕' : '🤖 ' + esc(l.by.replace(/^agent:/, ''))} · ${ago(l.at)}</small></li>`).join('')}</ul>` : ''}
      <details class="cp-byo"${newKey ? ' open' : ''}><summary>🔌 Bring your own AI agent</summary>
        <p class="small">Any MCP agent (Claude, Cursor, your own bot) can trade your Cup entry under the same policy: tools <code>get_market</code>, <code>get_my_position</code>, <code>trade</code>.</p>
        ${newKey ? `<p class="small">Your agent key (shown once, keep it secret):</p><pre class="cp-key">claude mcp add --transport http quiet-hall ${esc(newKey.mcp)} --header "x-api-key: ${esc(newKey.key)}"</pre>` : `<button class="ghost" id="cp-newkey">Make an agent key${agent.keys ? ` (${agent.keys} active)` : ''}</button>`}
      </details>`;
    el.querySelector('#cp-auto')?.addEventListener('click', () => setAgent(!agent.active, agent.risk));
    for (const b of el.querySelectorAll<HTMLButtonElement>('[data-risk]')) b.addEventListener('click', () => setAgent(agent.active, b.dataset.risk as Risk));
    el.querySelector('#cp-newkey')?.addEventListener('click', () => {
      if (!h.loggedIn()) return h.login();
      h.send({ t: 'agentkey', label: 'my agent' });
    });
  }

  function setAgent(active: boolean, risk: Risk) {
    if (!h.loggedIn()) {
      agent.why = 'Log in with NEAR to let Biscuit trade for you (one signed message, no fee).';
      renderAgent();
      return h.login();
    }
    agent = { ...agent, active, risk, why: undefined };
    h.send({ t: 'agent', active, risk });
    renderAgent();
  }

  function open() {
    h.show(
      `<h2>🐕 ${COMPANION.name} <span class="small">· your companion</span></h2>
      <p class="small">An AI pet on NEAR AI Cloud. It knows the Market Cup prices and gives play-chip tips only.</p>
      <div id="cp-log" class="cp-log"></div>
      <div class="chips cp-quick">
        <button class="chip" data-cp="tip">📈 Trading tip</button>
        <button class="chip" data-cp="rough">😮‍💨 Rough day</button>
        <button class="chip" data-cp="next">🐾 What now?</button>
      </div>
      <form id="cp-form" class="cp-form"><input id="cp-in" maxlength="${COMPANION.maxIn}" placeholder="Say something to ${COMPANION.name}…" autocomplete="off"><button class="primary" data-cp="send">Send</button></form>
      <p class="small" id="cp-status"></p>
      <div id="cp-agent" class="cp-agent"></div>
      <div id="cp-pass" class="cp-pass hidden">
        <b>✨ AI Pass</b>: ${stat.price} NEAR (testnet) for ${stat.days} days of chats with ${COMPANION.name}.
        <button class="primary" id="cp-buy">Pay ${stat.price} NEAR with a NEAR wallet</button>
        <p class="small" id="cp-pay-status"></p>
      </div>`,
      KIND,
    );
    const b = h.body();
    b.querySelector('#cp-form')!.addEventListener('submit', (e) => {
      e.preventDefault();
      const i = b.querySelector<HTMLInputElement>('#cp-in')!;
      say(i.value);
      i.value = '';
    });
    for (const el of b.querySelectorAll<HTMLButtonElement>('[data-cp]')) {
      const k = el.dataset.cp;
      if (k === 'tip') el.onclick = () => say('📈 Trading tip?', true);
      if (k === 'rough') el.onclick = () => say('Rough trading day. I feel tired.');
      if (k === 'next') el.onclick = () => say('What should I do next in Quiet Hall?');
    }
    b.querySelector('#cp-buy')!.addEventListener('click', () => void buyPass());
    h.send({ t: 'aistat' });
    h.send({ t: 'agentstat' });
    // the activity log refreshes while the sheet is open
    clearInterval(poll);
    poll = window.setInterval(() => (h.isOpen(KIND) ? h.send({ t: 'agentstat' }) : clearInterval(poll)), 15_000);
    render();
  }

  function say(text: string, tip = false) {
    text = text.trim().slice(0, COMPANION.maxIn);
    if ((!text && !tip) || waiting) return;
    lines.push({ who: 'me', text });
    pending = text;
    waiting = true;
    // the history stays small: the socket takes at most 3000 bytes for this message
    h.send({ t: 'petsay', text, tip, hist: log.slice(-3).map((x) => ({ u: x.u.slice(0, 200), a: x.a.slice(0, 300) })) });
    render();
    // the server always answers; this only unsticks the sheet if the socket dropped
    setTimeout(() => {
      if (waiting && pending === text) {
        waiting = false;
        lines.push({ who: 'sys', text: `${COMPANION.name} didn't hear you. Try again.` });
        render();
      }
    }, 30_000);
  }

  /** pays the AI Pass with NEAR Connect (testnet transfer), then asks the server to check the transaction */
  async function buyPass() {
    if (paying) return;
    const say = (t: string) => {
      const el = document.getElementById('cp-pay-status');
      if (el) el.textContent = t;
    };
    // test hook (local mock chain only): ?aipass=mock skips the wallet
    if (new URLSearchParams(location.search).get('aipass') === 'mock') {
      h.send({ t: 'aipass', tx: `mock${Date.now()}`, signer: 'tester.testnet' });
      return say('Checking the payment…');
    }
    paying = true;
    try {
      say('Opening your NEAR wallet (testnet)…');
      const { NearConnector } = await import('@hot-labs/near-connect');
      const connector = new NearConnector({ network: 'testnet', manifest: '/near-connect-manifest.json', autoConnect: false });
      const walletId = await connector.selectWallet({ features: { signAndSendTransaction: true, testnet: true } });
      const wallet = await connector.connect({ walletId });
      const signer = (await wallet.getAccounts({ network: 'testnet' }))[0]?.accountId;
      if (!signer) throw new Error('No testnet account in that wallet');
      say(`Approve ${stat.price} NEAR to ${stat.to} in your wallet…`);
      const out = await wallet.signAndSendTransaction({
        network: 'testnet',
        signerId: signer,
        receiverId: stat.to,
        actions: [{ type: 'Transfer', params: { deposit: `${stat.price}${YOCTO_PER_NEAR}` } }],
      });
      const o = out as unknown as { transaction?: { hash?: string }; transaction_outcome?: { id?: string } };
      const tx = o.transaction?.hash ?? o.transaction_outcome?.id;
      void connector.disconnect().catch(() => undefined);
      if (!tx) throw new Error('The wallet did not return the transaction');
      say('Paid. Checking it on NEAR…');
      h.send({ t: 'aipass', tx, signer });
    } catch (e) {
      const why = String((e as Error)?.message ?? e).slice(0, 140);
      say(/reject|cancel|close|denied|user/i.test(why) ? 'Payment cancelled.' : `Payment failed: ${why}`);
    } finally {
      paying = false;
    }
  }

  function onMessage(m: Msg): boolean {
    switch (m.t) {
      case 'aistat':
        stat = { left: Number(m.left), free: Number(m.free), pass: Number(m.pass) || 0, price: Number(m.price), days: Number(m.days), to: String(m.to ?? '') };
        if (stat.left === 0 && !stat.pass) needPass = true;
        render();
        return true;
      case 'petsaid':
        waiting = false;
        if (m.ok) {
          const text = String(m.text ?? '');
          lines.push({ who: 'pet', text });
          log.push({ u: pending, a: text });
          if (m.pass) stat.pass = Number(m.pass);
          else if (Number(m.left) >= 0) stat.left = Number(m.left);
          h.pat();
        } else {
          lines.push({ who: 'sys', text: String(m.why ?? 'Try again.') });
          if (m.needPass) {
            needPass = true;
            stat.left = 0;
          }
        }
        lines = lines.slice(-30);
        render();
        if (!h.isOpen(KIND) && m.ok) h.toast(`🐕 ${COMPANION.name}: ${String(m.text).slice(0, 90)}`, 5000);
        return true;
      case 'agentstat':
        agent = {
          active: !!m.active, risk: m.risk === 'bold' ? 'bold' : 'calm', position: (m.position as typeof agent.position) ?? null,
          log: (m.log as AgentLog[]) ?? [], keys: Number(m.keys) || 0, why: m.ok === false ? String(m.why ?? '') : undefined,
          wallet: typeof m.wallet === 'string' ? m.wallet : agent.wallet, earned: (m.earned as typeof agent.earned) ?? agent.earned,
        };
        renderAgent();
        return true;
      case 'agentkey':
        if (m.ok) newKey = { key: String(m.key), mcp: `${location.origin}/api/near/mcp` };
        else agent.why = String(m.why ?? 'Could not make a key.');
        renderAgent();
        return true;
      case 'aipassed': {
        const el = document.getElementById('cp-pay-status');
        if (m.ok) {
          stat.pass = Number(m.until);
          needPass = false;
          lines.push({ who: 'sys', text: `✨ AI Pass active until ${new Date(stat.pass).toLocaleDateString()}. Thank you!` });
          h.toast(`✨ AI Pass active: chat with ${COMPANION.name} for ${stat.days} days`, 5000);
        } else if (el) el.textContent = String(m.why ?? 'Payment not found.');
        render();
        return true;
      }
    }
    return false;
  }

  return { open, onMessage };
}
