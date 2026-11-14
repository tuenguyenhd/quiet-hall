// AI companion (NEAR edition): Biscuit's replies on NEAR AI Cloud, and the AI Pass payment check.
// Numbers and the prompt: src/companion.ts. The Hall calls these; allowances live in the Economy store.
import { COMPANION, cleanHistory, mockReply, systemPrompt, type CompanionContext } from '../src/companion';

export interface CompanionEnv {
  /** NEAR AI Cloud key (secret). Unset or LLM_MODE=mock = deterministic replies. */
  NEARAI_API_KEY?: string;
  LLM_BASE_URL?: string;
  LLM_MODE?: string;
  /** model for the companion (default anthropic/claude-haiku-5-5 on NEAR AI Cloud) */
  AI_MODEL?: string;
}

/** one reply. `null` = the AI call failed (the caller refunds the allowance). */
export async function companionReply(env: CompanionEnv, c: CompanionContext, text: string, hist: unknown): Promise<string | null> {
  if (env.LLM_MODE === 'mock' || !env.NEARAI_API_KEY) return mockReply(c, text);
  const base = (env.LLM_BASE_URL || 'https://cloud-api.near.ai/v1').replace(/\/+$/, '');
  const model = env.AI_MODEL || 'anthropic/claude-haiku-5-5';
  try {
    const r = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.NEARAI_API_KEY}` },
      body: JSON.stringify({
        model,
        max_tokens: COMPANION.maxTokens,
        temperature: 0.7,
        // short chat replies: no hidden reasoning (it used the whole token budget and left the reply empty)
        ...(model.startsWith('anthropic/') ? { thinking: { type: 'disabled' } } : {}),
        messages: [{ role: 'system', content: systemPrompt(c) }, ...cleanHistory(hist), { role: 'user', content: text.slice(0, COMPANION.maxIn) }],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) {
      console.log('companion llm http', r.status);
      return null;
    }
    const j = (await r.json()) as { choices?: { message?: { content?: unknown } }[] };
    const out = j.choices?.[0]?.message?.content;
    if (typeof out !== 'string' || !out.trim()) return null;
    return out.replace(/<think>[\s\S]*?<\/think>/g, '').trim().slice(0, COMPANION.maxOut);
  } catch (e) {
    console.log('companion llm failed', String((e as Error)?.message ?? e).slice(0, 120));
    return null;
  }
}

const YOCTO = 10n ** 24n;

/**
 * Checks an AI Pass payment on NEAR: a successful transaction from `signer` to `receiver` that transfers at least
 * COMPANION.passNear NEAR. Returns the signer on success. Each tx hash is recorded once by the Economy store.
 */
export async function verifyPassTx(rpcs: string[], tx: string, signer: string, receiver: string): Promise<{ ok: true } | { ok: false; why: string }> {
  if (!/^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(tx)) return { ok: false, why: 'That is not a transaction hash.' };
  if (!/^[a-z0-9._-]{2,64}$/.test(signer)) return { ok: false, why: 'Bad account.' };
  for (const rpc of rpcs) {
    try {
      const r = await fetch(rpc, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tx', params: { tx_hash: tx, sender_account_id: signer, wait_until: 'EXECUTED_OPTIMISTIC' } }),
        signal: AbortSignal.timeout(12_000),
      });
      const j = (await r.json()) as {
        result?: { status?: Record<string, unknown>; transaction?: { signer_id: string; receiver_id: string; actions: unknown[] } };
        error?: unknown;
      };
      if (j.error) continue;
      const t = j.result?.transaction;
      if (!t) continue;
      if (!j.result?.status || !('SuccessValue' in j.result.status)) return { ok: false, why: 'The payment did not succeed.' };
      if (t.signer_id !== signer || t.receiver_id !== receiver) return { ok: false, why: `The payment must go to ${receiver}.` };
      let paid = 0n;
      for (const a of t.actions) {
        const d = (a as { Transfer?: { deposit?: string } })?.Transfer?.deposit;
        if (d) paid += BigInt(d);
      }
      if (paid < BigInt(COMPANION.passNear) * YOCTO) return { ok: false, why: `The AI Pass is ${COMPANION.passNear} NEAR.` };
      return { ok: true };
    } catch {
      /* next RPC */
    }
  }
  return { ok: false, why: 'Could not find that payment yet. Try again in a few seconds.' };
}
