import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "node:crypto";
import { kvConfigured, kvSAdd, kvSMembers, kvSet, kvMGet } from "../lib/server/kv.js";

// Contact-me capture for the landing page.
//   POST { name, email, message }  → store the message
//   GET  ?code=<setup code>        → owner-only: list every message
const SETUP_CODE_HASH = "7ed450cbc8df08f6c7ad38bc788a696b94b0bdd0e32513754c5fe95b602aeea3";
const SET_KEY = "ollin:contact";
const META_PREFIX = "ollin:contact:";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sha256hex = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

interface Msg { id: string; name: string; email: string; message: string; ts: number }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!kvConfigured()) {
    return res.status(503).json({ error: "Messages aren't configured yet." });
  }
  try {
    if (req.method === "GET") {
      const code = String(req.query.code ?? "").trim().toUpperCase();
      if (sha256hex(code) !== SETUP_CODE_HASH) {
        return res.status(403).json({ error: "Not authorized." });
      }
      const ids = await kvSMembers(SET_KEY);
      const raw = ids.length ? await kvMGet(ids.map((i) => META_PREFIX + i)) : [];
      const list = raw
        .map((r) => { try { return r ? (JSON.parse(r) as Msg) : null; } catch { return null; } })
        .filter(Boolean)
        .sort((a, b) => (b!.ts - a!.ts));
      return res.status(200).json({ count: list.length, messages: list });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Method not allowed." });
    }

    const name = String(req.body?.name ?? "").trim().slice(0, 120);
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const message = String(req.body?.message ?? "").trim().slice(0, 4000);
    if (!name) return res.status(400).json({ error: "Tell me your name so I know who I'm talking to." });
    if (!EMAIL_RE.test(email) || email.length > 254) {
      return res.status(400).json({ error: "That doesn't look like a valid email." });
    }
    if (!message) return res.status(400).json({ error: "The message is empty — say anything, even the messy version." });

    const id = crypto.randomUUID();
    const msg: Msg = { id, name, email, message, ts: Date.now() };
    await kvSAdd(SET_KEY, id);
    await kvSet(META_PREFIX + id, msg);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("api/contact failure", error);
    return res.status(500).json({ error: "Couldn't send that right now — try again." });
  }
}
