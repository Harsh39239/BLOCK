# BLOCK website and web app

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
- **Sessions, streaks, stats, modes, strict mode, emergency unlocks** are stored on the device (and in a signed-in Claude account when available).
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
