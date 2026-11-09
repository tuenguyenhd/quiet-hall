// Where the live-hall server lives. Empty = same origin (local dev via Vite proxy, or Worker-served build).
// On Vercel, set VITE_HALL_URL=https://quiet-hall.<account>.workers.dev
const BASE = ((import.meta.env.VITE_HALL_URL as string | undefined) ?? '').replace(/\/$/, '');

export const apiUrl = (p: string) => BASE + p;

export function wsUrl(room: string) {
  const origin = BASE || `${location.protocol}//${location.host}`;
  return `${origin.replace(/^http/, 'ws')}/ws?room=${room}`;
}

export async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(apiUrl(path));
  const j = await r.json();
  if (!r.ok) throw new Error((j as { error?: string }).error ?? r.statusText);
  return j as T;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error((j as { error?: string }).error ?? r.statusText);
  return j as T;
}
