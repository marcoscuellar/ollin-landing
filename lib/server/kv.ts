// Vercel KV REST API (Upstash-compatible) helpers. Credentials come from the
// server env (KV_REST_API_URL / KV_REST_API_TOKEN) and never reach the client.

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

export function kvConfigured(): boolean {
  return Boolean(KV_URL && KV_TOKEN);
}

async function command(cmd: (string | number)[]): Promise<unknown> {
  if (!KV_URL || !KV_TOKEN) throw new Error("KV not configured");
  const r = await fetch(KV_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${KV_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(cmd),
  });
  if (!r.ok) throw new Error(`KV request failed: ${r.status}`);
  const data = (await r.json()) as { result?: unknown; error?: string };
  if (data.error) throw new Error(data.error);
  return data.result ?? null;
}

/** GET a key and JSON-parse it (values are stored as JSON strings). */
export async function kvGet<T = unknown>(key: string): Promise<T | null> {
  const raw = await command(["GET", key]);
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as unknown as T;
  }
}

/** GET a key as its raw stored string (no JSON parse). */
export async function kvGetRaw(key: string): Promise<string | null> {
  const raw = await command(["GET", key]);
  return typeof raw === "string" ? raw : null;
}

export async function kvSet(
  key: string,
  value: unknown,
  opts?: { ttlSec?: number; nx?: boolean },
): Promise<boolean> {
  const v = typeof value === "string" ? value : JSON.stringify(value);
  const cmd: (string | number)[] = ["SET", key, v];
  if (opts?.ttlSec) cmd.push("EX", opts.ttlSec);
  if (opts?.nx) cmd.push("NX");
  const res = await command(cmd);
  return res === "OK";
}

export async function kvDel(key: string): Promise<void> {
  await command(["DEL", key]);
}

export async function kvSAdd(key: string, member: string): Promise<void> {
  await command(["SADD", key, member]);
}

export async function kvSMembers(key: string): Promise<string[]> {
  const res = await command(["SMEMBERS", key]);
  return Array.isArray(res) ? (res as string[]) : [];
}

export async function kvMGet(keys: string[]): Promise<(string | null)[]> {
  if (!keys.length) return [];
  const res = await command(["MGET", ...keys]);
  return Array.isArray(res) ? (res as (string | null)[]) : [];
}
