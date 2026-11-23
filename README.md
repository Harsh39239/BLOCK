# BLOCK website and web app

**Live:** https://harsh39239.github.io/BLOCK/ (GitHub Pages, deploys automatically from `main`)

| File | What it is |
|---|---|
| `block.html` | The whole site: landing page, setup, and the app (Home, Modes, Schedule, Insights, Profile). |
| `manifest.webmanifest`, `sw.js`, `icon*.png`, `icon.svg` | Make BLOCK installable as a phone app and let it open offline. |
| `ANDROID_PLAN.md` | Researched plan for the native Android app that actually blocks other apps. |
| `block.backup.html` | The original file before any fixes. Safe to delete once you're happy. |
| `.claude/launch.json` | Lets Claude preview the site locally. Not needed for hosting. |

## What works in the web version

- **Pre-orders and early-access emails** go to Supabase (project **block**, Mumbai region). See them in the Supabase dashboard under **Table Editor → `preorders` / `signups`**.
  - The key in `block.html` can only *add* rows. It can't read, edit or delete them.
  - The database works out each order's total itself, so a visitor can't fake a price.
  - Duplicate emails are ignored.
  - If a visitor is offline, the row waits on their device and is sent when they're back online.
- **Real puck pairing and unlocking**, three ways:
  - **NFC tap**: Chrome on Android, over HTTPS. The tag's ID becomes the only key; other tags are refused.
  - **QR code** on the puck's base, using the camera. Works on Android Chrome.
  - **Demo puck**: click it on screen. This is for desktops and people without a puck yet. Once a real puck is paired, the demo click stops working.
- **Sessions, streaks, stats, modes, strict mode, emergency unlocks** are stored on the device.
- **Two-step setup.** Pick apps (popular ones pre-picked; name is optional), then pair a puck.
- **Modes, up to 10, fully editable:**
  - "Block these apps", "Allow only these" or "Block everything" (the essentials always stay open);
  - browsers in the app list, plus blocked websites;
  - a switch to silence notifications from blocked apps.

  Websites and notifications take effect in the Android app.
- **Locking:**
  - Pick a length: until you tap, 25 min, 1 hour or 2 hours. Timed sessions unlock on their own.
  - "Hold to lock anyway" when the puck isn't nearby. Unlocking still needs a puck.
  - Option to hide the session clock.
- **More than one puck** per phone (desk, bedroom...). Any paired puck unlocks; anyone else's is refused. One puck can be shared by a household.
- **Schedule quick-adds:** Bedtime, Study evenings and Work day in one tap.
- **Accounts:** sign in from the landing page's **Sign in** button, during setup, or in Profile. Three ways in from one form:
  - create an account with email + password;
  - sign in with email + password;
  - have a one-time link emailed instead (no password).

  Each person's data sits in one row of `user_state` that only they can read or write. Two devices are merged, never overwritten.
- **Email on every new pre-order or sign-up.** A Postgres trigger calls the `notify-signup` Edge Function through pg_net, which sends two emails: a notification to the BLOCK inbox and an automatic reply to the person. The row is stamped `notified_at` as it is claimed, so nobody is ever emailed twice. See `supabase/functions/notify-signup/index.ts`.
- **Insights:**
  - time won back (an estimate from the "hours a day" baseline, which can be changed in Profile);
  - this week vs last week;
  - when you lock (morning, afternoon, evening, night);
  - urges resisted (logged from Home, or "Actually, I'll stay locked" in the unlock dialog);
  - a shareable streak card.
- **Appearance:** Dark, Light or Match my phone for app screens. The landing page stays dark.
- **Accessibility:**
  - Dialogs are labelled, hold keyboard focus, close with Escape, and return focus to whatever opened them.
  - The 3D puck works with Enter or Space.
  - Toasts are announced to screen readers.
  - Animations respect reduced-motion settings.

## Turning the emails on (one time, in the Supabase dashboard)

The trigger, the function and the database are all deployed and tested. They just need an email
sender, which is the one part that needs an account of your own.

1. Create a free account at [resend.com](https://resend.com) and copy an API key.
2. In Supabase → **Edge Functions → Secrets**, add:
   - `RESEND_API_KEY` — the key you just copied;
   - `OWNER_EMAIL` — where notifications should land;
   - `FROM_EMAIL` *(optional)* — only once you've verified a domain with Resend. Until then leave it
     out and it uses Resend's shared test sender.
3. Submit the form on the live site and both emails go out.

Without a verified domain of your own, Resend only delivers to the address that owns the Resend
account, which is enough to demo both emails. To email anyone, verify a domain in Resend and set
`FROM_EMAIL` to an address on it.

## Supabase setup for sign-in (one time, in the dashboard)

Sign-in emails need two settings that can't be changed from this repo:

1. **Authentication → URL Configuration**
   - Site URL: `https://harsh39239.github.io/BLOCK/block.html`
   - Redirect URLs: add `https://harsh39239.github.io/BLOCK/**`, plus `http://localhost:4317/**` for local testing.

   Without this, the link in the email goes to `localhost:3000` and sign-in fails.
2. **Authentication → Emails → SMTP Settings**: before real users sign in, connect your own email sender (for example Resend, Postmark or Amazon SES).
   - Supabase's built-in sender only delivers to members of your Supabase team, and only a few emails an hour.
   - Until then, sign-in works for your own address only.
- **Schedules** lock and unlock on time while BLOCK is open, with notifications if allowed.
- **Install as an app** from Chrome ("Install BLOCK" in Profile, or the browser menu). The installed app opens offline.
- **Responsive**: tested with no sideways scrolling at 320, 375, 414, 768, 1024 and 1440 px wide.

## What it can't do (needs the Android app)

A web page can't stop other apps from opening. The web app tracks real sessions and keeps the puck as the key, but the actual blocking needs the native app described in `ANDROID_PLAN.md`.

## Hosting

Upload the folder to any static host that serves **HTTPS**: Netlify, Vercel, Cloudflare Pages or GitHub Pages.
- NFC, the camera, installing and offline mode all need HTTPS. They won't work from a `file://` link or inside an iframe.
- Hosting with the page renamed to `index.html` is fine. In that case, also update `start_url` in `manifest.webmanifest` and the `block.html` entries in `sw.js`.

## Testing NFC

1. Open the hosted site in Chrome on an Android phone with NFC turned on.
2. Open the app and reach the "Pair your puck" step.
3. Hold any NFC sticker or card (NTAG213/215 is ideal) to the back of the phone.

## Before launch

- **The film link** in the page points to a claude.ai artifact. Check that it plays for someone who isn't logged in.
- **Statistics:** check the three figures against the original reports. They were sourced through web searches.
- **Spam:** if fake sign-ups start appearing, add a captcha or a rate-limited Supabase Edge Function in front of the inserts.
