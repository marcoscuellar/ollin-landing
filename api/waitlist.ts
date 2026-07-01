import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "node:crypto";
import { kvConfigured, kvSAdd, kvSMembers, kvSet, kvMGet } from "../lib/server/kv.js";

// Early-access waitlist capture for the marketing page.
//   POST { email }            → add to the deduped waitlist (set), store first-seen meta
//   GET  ?code=<setup code>   → owner-only: list every signup with its metadata
//
// Emails live in a Redis set (ollin:waitlist) so duplicates collapse on their own;
// per-email meta (when, source) is kept under ollin:waitlist:meta:<email>.

const SETUP_CODE_HASH = "7ed450cbc8df08f6c7ad38bc788a696b94b0bdd0e32513754c5fe95b602aeea3";
const SET_KEY = "ollin:waitlist";
const META_PREFIX = "ollin:waitlist:meta:";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sha256hex = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

interface Meta { email: string; ts: number; source?: string }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!kvConfigured()) {
    return res.status(503).json({ error: "Capture isn't configured yet." });
  }

  try {
    // ── owner-only listing ──
    if (req.method === "GET") {
      const code = String(req.query.code ?? "").trim().toUpperCase();
      if (sha256hex(code) !== SETUP_CODE_HASH) {
        return res.status(403).json({ error: "Not authorized." });
      }
      const emails = await kvSMembers(SET_KEY);
      const metas = emails.length ? await kvMGet(emails.map((e) => META_PREFIX + e)) : [];
      const list: Meta[] = emails.map((email, i) => {
        const raw = metas[i];
        if (raw) { try { return JSON.parse(raw) as Meta; } catch { /* fall through */ } }
        return { email, ts: 0 };
      }).sort((a, b) => b.ts - a.ts);
      return res.status(200).json({ count: list.length, signups: list });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Method not allowed." });
    }

    // ── capture ──
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const source = String(req.body?.source ?? "landing").slice(0, 40);
    if (!EMAIL_RE.test(email) || email.length > 254) {
      return res.status(400).json({ error: "That doesn't look like a valid email." });
    }

    await kvSAdd(SET_KEY, email);
    // Keep the first-seen record; don't clobber it on repeat submits.
    const meta: Meta = { email, ts: Date.now(), source };
    await kvSet(META_PREFIX + email, meta, { nx: true });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("api/waitlist failure", error);
    return res.status(500).json({ error: "Couldn't save that right now — try again." });
  }
}
