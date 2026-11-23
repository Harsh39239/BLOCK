// BLOCK — sends two emails whenever someone pre-orders or joins the early-access list.
//
//   1. a notification to the BLOCK inbox  ("new pre-order from ...")
//   2. an automatic reply to the person who just submitted
//
// A Postgres trigger calls this through pg_net right after the row is inserted,
// so the website never waits for email to send. Before sending, the row is
// stamped `notified_at`; that stamp is claimed in a single UPDATE, so a retry
// (or anyone poking this URL) can never send the same person two emails.
//
// Needs two secrets on the project: RESEND_API_KEY and OWNER_EMAIL.
// Optional: FROM_EMAIL (defaults to Resend's shared test sender).

const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const OWNER_EMAIL = Deno.env.get("OWNER_EMAIL") ?? "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "BLOCK <onboarding@resend.dev>";
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY") ?? "";

const INK = "#121311", SURFACE = "#1b1d19", LINE = "#32352d";
const TEXT = "#f2f0e8", MUTED = "#a3a699", LIME = "#c6ff3d", LIME_INK = "#10140a";
const SITE = "https://harsh39239.github.io/BLOCK/";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

const rupees = (n: number) => "₹" + Number(n || 0).toLocaleString("en-IN");

/** One shell so both emails look like the same product. */
function shell(title: string, bodyHtml: string, footer: string) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:${INK};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${INK};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${SURFACE};border:1px solid ${LINE};border-radius:20px;">
        <tr><td style="padding:28px 28px 0;">
          <div style="font:700 20px/1 Arial,Helvetica,sans-serif;letter-spacing:.22em;color:${LIME};">BLOCK</div>
          <h1 style="margin:22px 0 0;font:700 26px/1.15 Arial,Helvetica,sans-serif;color:${TEXT};">${title}</h1>
        </td></tr>
        <tr><td style="padding:14px 28px 4px;font:400 15px/1.6 Arial,Helvetica,sans-serif;color:${MUTED};">
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:22px 28px 30px;">
          <p style="margin:0;font:400 13px/1.6 Arial,Helvetica,sans-serif;color:#6f7466;border-top:1px solid ${LINE};padding-top:18px;">${footer}</p>
        </td></tr>
      </table>
      <p style="margin:18px 0 0;font:400 12px Arial,Helvetica,sans-serif;color:#6f7466;">Tap to stop.</p>
    </td></tr>
  </table></body></html>`;
}

function row(label: string, value: string) {
  return `<tr>
    <td style="padding:7px 0;font:400 14px Arial,Helvetica,sans-serif;color:${MUTED};">${esc(label)}</td>
    <td style="padding:7px 0;font:700 14px Arial,Helvetica,sans-serif;color:${TEXT};text-align:right;">${esc(value)}</td>
  </tr>`;
}

function button(href: string, text: string) {
  return `<a href="${href}" style="display:inline-block;margin-top:20px;background:${LIME};color:${LIME_INK};
    font:700 15px Arial,Helvetica,sans-serif;text-decoration:none;padding:13px 26px;border-radius:999px;">${esc(text)}</a>`;
}

async function sendEmail(to: string, subject: string, html: string, replyTo?: string) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  const body = await r.text();
  if (!r.ok) throw new Error(`resend ${r.status}: ${body.slice(0, 300)}`);
  return JSON.parse(body || "{}");
}

/**
 * Claim the row: stamp notified_at only if it is still null, and get the row
 * back. An empty result means it was already handled, so we send nothing.
 */
async function claimRow(table: string, id: string) {
  const r = await fetch(
    `${SB_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&notified_at=is.null&select=*`,
    {
      method: "PATCH",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ notified_at: new Date().toISOString() }),
    },
  );
  if (!r.ok) throw new Error(`claim ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const rows = await r.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

Deno.serve(async (req) => {
  const json = (body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

  if (req.method !== "POST") return json({ ok: false, error: "post only" });

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, error: "body was not json" });
  }

  const table = String(payload.table ?? "");
  const record = (payload.record ?? {}) as Record<string, unknown>;
  const id = String(record.id ?? "");
  if (table !== "preorders" && table !== "signups") return json({ ok: false, error: "unknown table" });
  if (!id) return json({ ok: false, error: "no row id" });

  if (!RESEND_KEY || !OWNER_EMAIL) {
    // Not configured yet. Say so plainly in the logs and leave the row alone,
    // so the emails still go out once the secrets are added.
    console.error("Missing secrets: set RESEND_API_KEY and OWNER_EMAIL on this project.");
    return json({ ok: false, error: "email is not configured yet" });
  }

  let r: Record<string, unknown> | null;
  try {
    r = await claimRow(table, id);
  } catch (e) {
    console.error("claim failed", String(e));
    return json({ ok: false, error: "could not read the row" });
  }
  if (!r) return json({ ok: true, skipped: "already emailed" });

  const email = String(r.email ?? "");
  const when = new Date(String(r.created_at ?? Date.now())).toLocaleString("en-IN", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata",
  });
  const isOrder = table === "preorders";
  const name = String(r.name ?? "").trim();
  const qty = Number(r.quantity ?? 0);
  const total = Number(r.total_inr ?? 0);
  const result: Record<string, unknown> = { ok: true, table, id };

  // ---- 1. notification to the BLOCK inbox ----
  try {
    const details = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;">
      ${isOrder ? row("Name", name || "—") : ""}
      ${row("Email", email)}
      ${isOrder ? row("Quantity", qty + (qty === 1 ? " puck" : " pucks")) : ""}
      ${isOrder ? row("Total", rupees(total)) : ""}
      ${row("Came from", String(r.source ?? "web"))}
      ${row("When", when)}
    </table>`;
    await sendEmail(
      OWNER_EMAIL,
      isOrder
        ? `New pre-order: ${qty} ${qty === 1 ? "puck" : "pucks"} (${rupees(total)})`
        : `New early-access sign-up: ${email}`,
      shell(
        isOrder ? "New pre-order" : "New sign-up",
        `<p style="margin:0 0 4px;">${isOrder ? "Someone reserved a puck." : "Someone joined the early-access list."}</p>${details}`,
        "Sent automatically by BLOCK when a row lands in Supabase. Reply to this email to answer them directly.",
      ),
      email,
    );
    result.notified = OWNER_EMAIL;
  } catch (e) {
    console.error("notification failed", String(e));
    result.notifyError = String(e);
  }

  // ---- 2. automatic reply to the person ----
  try {
    const body = isOrder
      ? `<p style="margin:0 0 14px;">Thanks${name ? " " + esc(name) : ""} — your ${qty === 1 ? "puck is" : qty + " pucks are"} reserved.</p>
         <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
           ${row("Reserved", qty + (qty === 1 ? " puck" : " pucks"))}
           ${row("Total when it ships", rupees(total))}
           ${row("Delivery", "Free, across India")}
         </table>
         <p style="margin:16px 0 0;"><strong style="color:${TEXT};">Nothing has been charged.</strong> We'll email you when your batch is ready to ship, and you pay then. You'll have thirty days to send it back after it arrives.</p>
         <p style="margin:14px 0 0;">While you wait, the BLOCK app is free and already works in your browser.</p>
         ${button(SITE, "Open the app")}`
      : `<p style="margin:0 0 14px;">You're on the list. We make BLOCK in small batches, and you'll be the first to hear when the next one opens.</p>
         <p style="margin:0;">In the meantime the BLOCK app is free. Pick what to shut, set a bedtime schedule, and it'll keep your sessions and streaks even before your puck arrives.</p>
         ${button(SITE, "Open the app")}`;
    await sendEmail(
      email,
      isOrder ? "Your BLOCK puck is reserved" : "You're on the BLOCK early-access list",
      shell(isOrder ? "Reserved." : "You're on the list.", body,
        `You're getting this because you ${isOrder ? "reserved a BLOCK puck" : "asked for BLOCK early access"} at ${SITE}. Reply to this email if that wasn't you.`),
      OWNER_EMAIL,
    );
    result.replied = email;
  } catch (e) {
    console.error("auto-reply failed", String(e));
    result.replyError = String(e);
  }

  return json(result);
});
