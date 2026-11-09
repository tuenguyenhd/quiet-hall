import { DurableObject } from 'cloudflare:workers';
import { b64, decodeText, parseSiws, readSession, signSession, verifySignature } from './auth';
import { Ledger, priceTable, type SpotOwner } from './ledger';
import { serverRpc } from './solana';
import { BLESS, BLESS_FREE_MS, BLESS_PAID_MS, BOUNDS, FREE_SEEKER_MS, LAKE, LANTERN_FREE_MS, LIGHT_COUNT, PETS, SPECIES, WISHES, cleanName } from '../src/layout';

export { Ledger };

export interface Env {
  HALL: DurableObjectNamespace<Hall>;
  LEDGER: DurableObjectNamespace<Ledger>;
  ASSETS?: Fetcher;
  /** Secret for session tokens (.dev.vars locally, `wrangler secret put` in production). */
  SESSION_SECRET?: string;
  SOLANA_CLUSTER: string; // "devnet" for now
  SOLANA_RPC: string; // cluster RPC used to verify tips
  MAINNET_RPC: string; // read-only, for the Seeker Genesis Token check
  /** Helius key (secret). When set, the Worker uses Helius instead of SOLANA_RPC / MAINNET_RPC (public RPC blocks Workers). Never sent to clients. */
  HELIUS_API_KEY?: string;
  TIP_RECIPIENT: string;
  USDC_MINT: string;
  /** SKR (Seeker token) mint; unset = SKR payments off (devnet has no SKR). Mainnet: SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3 */
  SKR_MINT?: string;
  /** how many SKR one USDC of price costs (default 50) */
  SKR_PER_USDC?: string;
  /** Lets scripts/online-test.mjs open many sockets from one machine (?k=...). Secret; unset = off. */
  LOAD_TEST_KEY?: string;
  /** Devnet treasury secret key (base58) that pays for and signs NFT mints. Secret. */
  DEV_NET_SOL?: string;
  /** Mainnet: treasury secret key (base58) for minting; preferred over DEV_NET_SOL. Secret. */
  TREASURY_KEY?: string;
  STONE_COLLECTION?: string;
  TREE_COLLECTION?: string;
  /** Base URL used in NFT metadata links. */
  PUBLIC_URL: string;
  /** Daily World Sit start, UTC "HH:MM" (default 20:00). Set in .dev.vars to test. */
  WORLD_SIT?: string;
}

type SitState = 'idle' | 'sit';

/** Per-connection state, stored on the socket so it survives DO hibernation. */
interface Att {
  id: string;
  ip: string;
  pid: string; // persistent visitor id (for invite links), not an account
  c: number; // light colour index
  sd: number; // degen character seed (traits are derived from it on every client)
  pt: number; // pet (index into PETS, 0 = none)
  po: number[]; // pets this visitor owns
  bl: number; // blessing from fren (index into BLESS, -1 = none)
  bu: number; // blessing ends (ms)
  x: number;
  z: number;
  ry: number;
  s: SitState;
  since: number; // when the current sit started (ms)
  hello: boolean;
  win: number; // rate-limit window start
  n: number; // messages in window
  ring: number; // last bell/bowl ring (ms)
  addr: string; // signed-in wallet ('' = anonymous)
  g: boolean; // verified Seeker owner -> gold light
  sp: boolean; // supporter (tipped)
}

const MAX_ROOM = 400; // sockets per hall
const MAX_PER_IP = 8; // stops one machine faking a crowd
const MAX_BYTES = 400;
const MAX_PER_SEC = 30;
const COLORS = LIGHT_COUNT * SPECIES.length; // light colour + character
const BOUND = BOUNDS + 2;
const MAX_SIT_MIN = 180;
const WORLD_WINDOW_MIN = 20; // sits that start within 20 min of World Sit count toward it
const PID_RE = /^[a-z0-9]{8,16}$/;

const petIdx = (v: unknown) => {
  const k = Math.floor(typeof v === 'number' ? v : 0);
  return k >= 0 && k < PETS.length ? k : 0;
};
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const r2 = (v: number) => Math.round(v * 100) / 100;
const utcDay = () => new Date().toISOString().slice(0, 10);

function clampPos(x: number, z: number): [number, number] {
  const d = Math.hypot(x, z);
  if (d <= BOUND) return [x, z];
  return [(x / d) * BOUND, (z / d) * BOUND];
}

function att(ws: WebSocket): Att | null {
  try {
    return (ws.deserializeAttachment() as Att) ?? null;
  } catch {
    return null;
  }
}

const pub = (a: Att) => ({ id: a.id, color: a.c, sd: a.sd, pt: a.pt, ...(a.bu > Date.now() ? { bl: a.bl, bu: a.bu } : {}), x: r2(a.x), z: r2(a.z), ry: r2(a.ry), s: a.s, g: a.g, sp: a.sp });
const ledger = (env: Env) => env.LEDGER.get(env.LEDGER.idFromName('main'));

function cors(req: Request, res: Response) {
  const h = new Headers(res.headers);
  h.set('Access-Control-Allow-Origin', req.headers.get('Origin') ?? '*');
  h.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  h.set('Access-Control-Allow-Headers', 'content-type');
  h.set('Vary', 'Origin');
  return new Response(res.body, { status: res.status, headers: h });
}
const json = (data: unknown, status = 200) => Response.json(data, { status });

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const t = await req.text();
    if (t.length > 8000) return {};
    const j = JSON.parse(t);
    return j && typeof j === 'object' ? j : {};
  } catch {
    return {};
  }
}

async function api(req: Request, env: Env, path: string): Promise<Response> {
  const ip = req.headers.get('CF-Connecting-IP') ?? 'local';
  const L = ledger(env);
  if (path === '/api/health') return json({ ok: true, now: Date.now() });
  if (path === '/api/config') {
    return json({ cluster: env.SOLANA_CLUSTER, rpc: env.SOLANA_RPC, recipient: env.TIP_RECIPIENT, usdcMint: env.USDC_MINT, skrMint: env.SKR_MINT || null });
  }
  if (path === '/api/spots') {
    // owners follow the chain (marketplace sales / transfers); cheap, throttled inside
    await L.syncOwners(new URL(req.url).searchParams.get('refresh') === '1');
    const sell = !!((env.TREASURY_KEY || env.DEV_NET_SOL) && env.STONE_COLLECTION && env.TREE_COLLECTION);
    const strip = (o: Record<number, SpotOwner>) =>
      Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { owner: v.owner, name: v.name, line: v.line, asset: v.asset ?? null }]));
    return json({ stone: strip(await L.spots('stone')), tree: strip(await L.spots('tree')), prices: priceTable(env), onSale: sell, cluster: env.SOLANA_CLUSTER });
  }
  const meta = /^\/api\/meta\/(stone|tree)\/(collection|\d+)\.json$/.exec(path);
  if (meta) {
    const kind = meta[1] as 'stone' | 'tree';
    const label = kind === 'stone' ? 'Stone' : 'Tree';
    const image = `${env.PUBLIC_URL}/items/${kind}.svg`;
    if (meta[2] === 'collection')
      return json({ name: `Quiet Hall ${label}s`, description: `${kind === 'stone' ? 108 : 64} ${kind}s in the Quiet Hall, each in a fixed spot.`, image, external_url: 'https://quiet-hall.vercel.app' });
    const n = Number(meta[2]);
    const rec = await L.spot(kind, n);
    return json({
      name: `Quiet Hall ${label} #${n + 1}`,
      description: rec ? `${rec.name}: ${rec.line}` : `An unclaimed ${kind} in the Quiet Hall.`,
      image,
      external_url: 'https://quiet-hall.vercel.app',
      attributes: [
        { trait_type: 'Place', value: kind === 'stone' ? 'Stone Garden' : 'Maple Grove' },
        { trait_type: 'Spot', value: n + 1 },
        ...(rec ? [{ trait_type: 'Name', value: rec.name }, { trait_type: 'Line', value: rec.line }] : []),
      ],
    });
  }
  if (path === '/api/nonce') {
    const nonce = await L.newNonce(ip);
    return nonce ? json({ nonce }) : json({ error: 'Too many requests' }, 429);
  }
  if (req.method !== 'POST') return json({ error: 'Not found' }, 404);
  const body = await readJson(req);

  if (path === '/api/verify') {
    // Sign-In-With-Solana: the wallet signed a message containing our one-time nonce and this site's domain.
    if (!env.SESSION_SECRET) return json({ error: 'Server missing SESSION_SECRET' }, 500);
    const addr = String(body.address ?? '');
    let msg: Uint8Array;
    let sig: Uint8Array;
    try {
      msg = b64.dec(String(body.message ?? ''));
      sig = b64.dec(String(body.signature ?? ''));
    } catch {
      return json({ error: 'Bad encoding' }, 400);
    }
    const f = parseSiws(decodeText(msg));
    const origin = req.headers.get('Origin');
    const host = origin ? new URL(origin).host : '';
    if (!f || f.address !== addr) return json({ error: 'Bad sign-in message' }, 400);
    if (!host || f.domain !== host) return json({ error: 'Sign-in message is for another site' }, 400);
    if (Math.abs(Date.now() - f.issuedAt) > 10 * 60000) return json({ error: 'Sign-in expired, try again' }, 400);
    if (!(await verifySignature(addr, msg, sig))) return json({ error: 'Signature check failed' }, 401);
    if (!(await L.useNonce(f.nonce))) return json({ error: 'Sign-in expired, try again' }, 400);
    const p = await L.profile(addr, true);
    return json({ token: await signSession(env.SESSION_SECRET, addr), address: addr, seeker: p.seeker, supporter: p.supporter });
  }
  if (path === '/api/me') {
    const addr = await readSession(env.SESSION_SECRET, body.token);
    if (!addr) return json({ error: 'Signed out' }, 401);
    const p = await L.profile(addr, body.recheck === true);
    return json({ address: addr, seeker: p.seeker, supporter: p.supporter });
  }
  if (path === '/api/tip/order') {
    const payer = await readSession(env.SESSION_SECRET, body.token);
    if ((body.kind === 'stone' || body.kind === 'tree') && !payer) return json({ error: 'Sign in first so your name goes on it.' }, 400);
    const o = await L.createOrder(ip, String(body.currency ?? 'SOL'), Number(body.amount), payer, {
      kind: typeof body.kind === 'string' ? body.kind : 'tip',
      spot: Number(body.spot),
      name: typeof body.name === 'string' ? body.name : '',
      line: typeof body.line === 'string' ? body.line : '',
      pet: Number(body.pet),
      pid: typeof body.pid === 'string' ? body.pid : undefined,
    });
    return 'error' in o ? json(o, 400) : json(o);
  }
  if (path === '/api/rpc') {
    // tiny RPC relay for the app (blockhash + send) through the server's RPC key; public mainnet RPC throttles browsers
    const method = body.method;
    if (method !== 'getLatestBlockhash' && method !== 'sendTransaction') return json({ error: 'method not allowed' }, 400);
    if (await L.limitedIp(ip)) return json({ error: 'Too many requests' }, 429);
    const params = Array.isArray(body.params) ? body.params.slice(0, 2) : [];
    if (method === 'sendTransaction' && !(typeof params[0] === 'string' && params[0].length < 2000)) return json({ error: 'bad tx' }, 400);
    const r = await fetch(serverRpc(env, 'cluster'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: body.id ?? 1, method, params }),
    });
    return new Response(r.body, { status: r.status, headers: { 'content-type': 'application/json' } });
  }
  if (path === '/api/tip/confirm') {
    const r = await L.confirmOrder(String(body.id ?? ''), typeof body.signature === 'string' ? body.signature : undefined);
    return json(r);
  }
  return json({ error: 'Not found' }, 404);
}

function send(ws: WebSocket, msg: unknown) {
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    /* socket closing */
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return new Response('Expected WebSocket', { status: 426 });
      }
      // "main" and "seeker" are the real halls; "t<id>" rooms are isolated rooms for automated tests.
      const want = url.searchParams.get('room') ?? 'main';
      const room = want === 'seeker' ? 'seeker' : /^t[a-z0-9]{4,16}$/.test(want) ? want : 'main';
      const fwd = new Request(req);
      fwd.headers.set('X-Room', room);
      return env.HALL.get(env.HALL.idFromName(room)).fetch(fwd);
    }
    if (url.pathname.startsWith('/api/')) {
      if (req.method === 'OPTIONS') return cors(req, new Response(null, { status: 204 }));
      try {
        return cors(req, await api(req, env, url.pathname));
      } catch (e) {
        return cors(req, json({ error: 'Server error', detail: String(e).slice(0, 200) }, 500));
      }
    }
    if (env.ASSETS) return env.ASSETS.fetch(req);
    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;

interface Lantern {
  id: string;
  wish: number;
  name: string;
  c: number;
  x: number;
  z: number;
  at: number;
  until: number;
  tier: 'free' | 'lantern24' | 'lantern7d';
}
const LANTERN_MS = { free: LANTERN_FREE_MS, lantern24: 86400000, lantern7d: 7 * 86400000 };
const MAX_LANTERNS = 80;

export class Hall extends DurableObject<Env> {
  private today = utcDay();
  private minutes = 0;
  private sits = 0;
  private world = 0; // people who joined today's World Sit

  /** Today's World Sit start (ms, UTC). */
  private worldAt(now = Date.now()) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(this.env.WORLD_SIT ?? '20:00');
    const h = m ? Math.min(23, Number(m[1])) : 20;
    const mi = m ? Math.min(59, Number(m[2])) : 0;
    const d = new Date(now);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, mi);
  }

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Keep-alive pings are answered without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    ctx.blockConcurrencyWhile(() => this.loadDay());
  }

  private async loadDay() {
    const d = await this.ctx.storage.get<{ m: number; s: number }>(`day:${this.today}`);
    this.minutes = d?.m ?? 0;
    this.sits = d?.s ?? 0;
    this.world = (await this.ctx.storage.get<number>(`world:${this.today}`)) ?? 0;
  }

  private async rollDay() {
    const d = utcDay();
    if (d !== this.today) {
      this.today = d;
      await this.loadDay();
    }
  }

  private async addSit(ms: number) {
    await this.rollDay();
    const min = Math.min(ms / 60000, MAX_SIT_MIN);
    if (!(min >= 0.25)) return; // ignore accidental taps
    this.minutes += min;
    this.sits += 1;
    await this.ctx.storage.put(`day:${this.today}`, { m: this.minutes, s: this.sits });
  }

  private async maybeWorld(now: number) {
    await this.rollDay();
    const at = this.worldAt(now);
    if (now >= at && now < at + WORLD_WINDOW_MIN * 60000) {
      this.world += 1;
      await this.ctx.storage.put(`world:${this.today}`, this.world);
    }
  }

  private async lanterns(): Promise<Lantern[]> {
    const all = (await this.ctx.storage.get<Lantern[]>('lanterns')) ?? [];
    const now = Date.now();
    const live = all.filter((l) => l.until > now);
    if (live.length !== all.length) await this.ctx.storage.put('lanterns', live);
    return live;
  }

  /** Light a lantern: free (1 per visitor and 3 per network per UTC day, 1 h) or from a paid order. */
  private async lightLantern(ws: WebSocket, a: Att, m: Record<string, unknown>) {
    const wish = Math.floor(num(m.wish, -1));
    if (!(wish >= 0 && wish < WISHES.length)) return;
    const name = cleanName(m.name);
    let tier: Lantern['tier'] = 'free';
    if (typeof m.order === 'string') {
      const t = await ledger(this.env).useLanternOrder(m.order);
      if (!t) return send(ws, { t: 'lanternNo', reason: 'That lantern order is not paid or was already used.' });
      tier = t;
    } else {
      const day = utcDay();
      const kp = `free:${a.pid || a.id}:${day}`;
      const ki = `freeip:${a.ip}:${day}`;
      const n = (await this.ctx.storage.get<number>(ki)) ?? 0;
      if ((await this.ctx.storage.get(kp)) || n >= 3) {
        return send(ws, { t: 'lanternNo', reason: 'You lit your free lantern today. Come back tomorrow, or light a special one.', paid: true });
      }
      await this.ctx.storage.put(kp, 1);
      await this.ctx.storage.put(ki, n + 1);
    }
    const now = Date.now();
    // float somewhere over the lake (everyone sees the same spot)
    const ang = Math.random() * Math.PI * 2;
    const rr = Math.sqrt(Math.random()) * 0.72;
    const l: Lantern = {
      id: crypto.randomUUID().slice(0, 8),
      wish,
      name,
      c: a.c,
      x: r2(LAKE.x + Math.cos(ang) * LAKE.rx * rr),
      z: r2(LAKE.z + Math.sin(ang) * LAKE.rz * rr),
      at: now,
      until: now + (tier === 'free' && a.g ? FREE_SEEKER_MS : LANTERN_MS[tier]),
      tier,
    };
    let list = await this.lanterns();
    list.push(l);
    if (list.length > MAX_LANTERNS) {
      // drop the free lanterns that end soonest
      const free = list.filter((x) => x.tier === 'free').sort((p, q) => p.until - q.until);
      const drop = new Set(free.slice(0, list.length - MAX_LANTERNS).map((x) => x.id));
      list = list.filter((x) => !drop.has(x.id));
    }
    await this.ctx.storage.put('lanterns', list);
    this.broadcast({ t: 'lantern', l });
  }

  /** A blessing from a fren: free (1 h, once per visitor per UTC day, 3 per network) or paid (24 h). One at a time; a new one replaces the old. */
  private async bless(ws: WebSocket, a: Att, m: Record<string, unknown>) {
    const f = Math.floor(num(m.f, -1));
    if (!(f >= 0 && f < BLESS.length)) return;
    let ms = BLESS_FREE_MS;
    if (typeof m.order === 'string') {
      if (!(await ledger(this.env).useBlessOrder(m.order))) return send(ws, { t: 'blessNo', reason: 'That blessing order is not paid or was already used.' });
      ms = BLESS_PAID_MS;
    } else {
      if (a.g) ms = FREE_SEEKER_MS; // Seeker perk: longer free taste
      const day = utcDay();
      const kp = `fbless:${a.pid || a.id}:${day}`;
      const ki = `fblessip:${a.ip}:${day}`;
      const n = (await this.ctx.storage.get<number>(ki)) ?? 0;
      if ((await this.ctx.storage.get(kp)) || n >= 3) {
        return send(ws, { t: 'blessNo', reason: 'You got your free blessing today. Come back tomorrow, or get a 24 h one.', paid: true });
      }
      await this.ctx.storage.put(kp, 1);
      await this.ctx.storage.put(ki, n + 1);
    }
    const now = Date.now();
    // the newest fren's colour; a paid blessing's time is never cut short by a free one
    a.bu = Math.max(now + ms, a.bu > now ? a.bu : 0);
    a.bl = f;
    if (a.pid) await this.ctx.storage.put(`bless:${a.pid}`, { f: a.bl, u: a.bu });
    ws.serializeAttachment(a);
    this.broadcast({ t: 'bl', id: a.id, f: a.bl, u: a.bu });
  }

  private live(except?: WebSocket): Att[] {
    const out: Att[] = [];
    for (const w of this.ctx.getWebSockets()) {
      if (w === except) continue;
      const a = att(w);
      if (a?.hello) out.push(a);
    }
    return out;
  }

  private stats(except?: WebSocket) {
    const people = this.live(except);
    return {
      here: people.length,
      sitting: people.filter((p) => p.s === 'sit').length,
      minutes: Math.round(this.minutes),
      sits: this.sits,
      world: this.world,
      worldAt: this.worldAt(),
    };
  }

  private broadcast(msg: unknown, except?: WebSocket) {
    const data = JSON.stringify(msg);
    for (const w of this.ctx.getWebSockets()) {
      if (w === except || !att(w)?.hello) continue;
      try {
        w.send(data);
      } catch {
        /* ignore */
      }
    }
  }

  private broadcastStats(except?: WebSocket) {
    this.broadcast({ t: 'stats', ...this.stats(except) }, except);
  }

  private room = 'main';

  async fetch(req: Request): Promise<Response> {
    this.room = req.headers.get('X-Room') ?? 'main';
    await this.ctx.storage.put('room', this.room);
    const ip = req.headers.get('CF-Connecting-IP') ?? 'local';
    const all = this.ctx.getWebSockets();
    if (all.length >= MAX_ROOM) return new Response('Hall is full', { status: 503 });
    const k = new URL(req.url).searchParams.get('k');
    const loadTest = !!this.env.LOAD_TEST_KEY && k === this.env.LOAD_TEST_KEY;
    if (!loadTest && all.filter((w) => att(w)?.ip === ip).length >= MAX_PER_IP) {
      return new Response('Too many connections', { status: 429 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    const a: Att = {
      id: crypto.randomUUID().slice(0, 8),
      ip,
      pid: '',
      c: 0,
      sd: 0,
      pt: 0,
      po: [],
      bl: -1,
      bu: 0,
      x: 0,
      z: 17,
      ry: Math.PI,
      s: 'idle',
      since: 0,
      hello: false,
      win: 0,
      n: 0,
      ring: 0,
      addr: '',
      g: false,
      sp: false,
    };
    server.serializeAttachment(a);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== 'string' || raw.length > MAX_BYTES) return;
    const a = att(ws);
    if (!a) return;
    const now = Date.now();
    if (now - a.win > 1000) {
      a.win = now;
      a.n = 0;
    }
    a.n++;
    if (a.n > MAX_PER_SEC) {
      ws.serializeAttachment(a);
      return;
    }
    let m: Record<string, unknown>;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    if (!m || typeof m !== 'object') return;

    switch (m.t) {
      case 'hello': {
        a.c = Math.max(0, Math.min(COLORS - 1, Math.floor(num(m.color))));
        a.sd = Math.floor(num(m.seed)) >>> 0;
        [a.x, a.z] = clampPos(num(m.x, 0), num(m.z, 17));
        a.ry = num(m.ry, Math.PI);
        if (m.s === 'sit' && a.s !== 'sit') {
          a.s = 'sit';
          a.since = now;
        }
        if (typeof m.pid === 'string' && PID_RE.test(m.pid)) a.pid = m.pid;
        const b = a.pid ? await this.ctx.storage.get<{ f: number; u: number }>(`bless:${a.pid}`) : undefined;
        [a.bl, a.bu] = b && b.u > now ? [b.f, b.u] : [-1, 0];
        // optional wallet session -> gold light for verified Seeker owners, supporter halo
        const addr = await readSession(this.env.SESSION_SECRET, m.session);
        if (addr) {
          const p = await ledger(this.env).profile(addr);
          a.addr = addr;
          a.g = p.seeker;
          a.sp = p.supporter;
        }
        // pets are bought: only show one this visitor owns
        a.po = await ledger(this.env).ownedPets(a.pid, a.addr);
        const want = petIdx(m.pet);
        a.pt = a.po.includes(want) ? want : 0;
        const room = (await this.ctx.storage.get<string>('room')) ?? this.room;
        if (room === 'seeker' && !a.g) {
          send(ws, { t: 'denied', reason: 'The Seeker hall is for verified Seeker owners.' });
          ws.close(4003, 'seeker only');
          return;
        }
        const invites = a.pid ? await ledger(this.env).invites(a.pid) : 0;
        a.hello = true;
        ws.serializeAttachment(a);
        await this.rollDay();
        send(ws, {
          t: 'welcome',
          you: a.id,
          now,
          room,
          invites,
          me: { g: a.g, sp: a.sp, bl: a.bl, bu: a.bu, pt: a.pt, pets: a.po },
          players: this.live(ws).map(pub),
          lanterns: await this.lanterns(),
          stats: this.stats(),
        });
        this.broadcast({ t: 'join', p: pub(a) }, ws);
        // arrived through a friend's "sit with me" link?
        if (typeof m.with === 'string' && PID_RE.test(m.with) && m.with !== a.pid) {
          const host = this.ctx.getWebSockets().find((w) => w !== ws && att(w)?.hello && att(w)?.pid === m.with);
          const h = host && att(host);
          if (host && h) {
            send(ws, { t: 'friendHere', id: h.id, x: r2(h.x), z: r2(h.z) });
            const count = a.pid ? await ledger(this.env).recordInvite(h.pid, a.pid) : 0;
            send(host, { t: 'friend', id: a.id, invites: count });
          } else send(ws, { t: 'friendAway' });
        }
        this.broadcast({ t: 'stats', ...this.stats() }, ws);
        return;
      }
      case 'move': {
        if (!a.hello) return;
        [a.x, a.z] = clampPos(num(m.x, a.x), num(m.z, a.z));
        a.ry = num(m.ry, a.ry);
        ws.serializeAttachment(a);
        this.broadcast({ t: 'm', id: a.id, x: r2(a.x), z: r2(a.z), ry: r2(a.ry) }, ws);
        return;
      }
      case 'state': {
        if (!a.hello) return;
        const s: SitState = m.s === 'sit' ? 'sit' : 'idle';
        if (s === a.s) return;
        if (a.s === 'sit') await this.addSit(now - a.since);
        a.s = s;
        a.since = s === 'sit' ? now : 0;
        if (s === 'sit') await this.maybeWorld(now);
        ws.serializeAttachment(a);
        this.broadcast({ t: 's', id: a.id, s }, ws);
        this.broadcast({ t: 'stats', ...this.stats() });
        return;
      }
      case 'profile': {
        // after signing in or tipping: refresh this person's gold light / supporter halo
        const addr = await readSession(this.env.SESSION_SECRET, m.session);
        if (!addr) return;
        const p = await ledger(this.env).profile(addr);
        a.addr = addr;
        a.g = p.seeker;
        a.sp = p.supporter;
        a.po = await ledger(this.env).ownedPets(a.pid, a.addr); // pets bought with this wallet on another device
        ws.serializeAttachment(a);
        this.broadcast({ t: 'p', id: a.id, g: a.g, sp: a.sp });
        send(ws, { t: 'pets', pets: a.po, pt: a.pt });
        return;
      }
      case 'lantern': {
        if (!a.hello) return;
        await this.lightLantern(ws, a, m);
        return;
      }
      case 'spots': {
        // someone bought a stone or tree: tell everyone to refresh the garden/grove
        if (!a.hello || now - a.ring < 3000) return;
        a.ring = now;
        ws.serializeAttachment(a);
        this.broadcast({ t: 'spots' });
        return;
      }
      case 'pet': {
        // choose / change your pet (free)
        if (!a.hello) return;
        const k = petIdx(m.k);
        if (k === a.pt) return;
        if (k && !a.po.includes(k)) {
          a.po = await ledger(this.env).ownedPets(a.pid, a.addr); // maybe just bought it
          if (!a.po.includes(k)) return send(ws, { t: 'petNo', k, reason: 'Adopt this pet first.' });
        }
        a.pt = k;
        send(ws, { t: 'pets', pets: a.po, pt: a.pt });
        ws.serializeAttachment(a);
        this.broadcast({ t: 'pt', id: a.id, k }, ws);
        return;
      }
      case 'bless': {
        if (!a.hello) return;
        await this.bless(ws, a, m);
        return;
      }
      case 'emote': {
        if (!a.hello || (m.e !== 'bow' && m.e !== 'greet' && m.e !== 'pat')) return;
        ws.serializeAttachment(a);
        this.broadcast({ t: 'e', id: a.id, e: m.e }, ws);
        return;
      }
      case 'ring': {
        if (!a.hello || now - a.ring < 5000) return;
        a.ring = now;
        ws.serializeAttachment(a);
        this.broadcast({ t: 'ring', id: a.id, what: m.what === 'bowl' ? 'bowl' : 'bell' }, ws);
        return;
      }
    }
  }

  async webSocketClose(ws: WebSocket) {
    await this.drop(ws);
    try {
      ws.close(1000, 'bye');
    } catch {
      /* already closed */
    }
  }

  async webSocketError(ws: WebSocket) {
    await this.drop(ws);
  }

  private async drop(ws: WebSocket) {
    const a = att(ws);
    if (!a?.hello) return;
    if (a.s === 'sit') await this.addSit(Date.now() - a.since);
    a.hello = false;
    a.s = 'idle';
    try {
      ws.serializeAttachment(a);
    } catch {
      /* closed */
    }
    this.broadcast({ t: 'leave', id: a.id }, ws);
    this.broadcastStats(ws);
  }
}
