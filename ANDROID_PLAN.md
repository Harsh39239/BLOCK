# BLOCK for Android: technical plan

Researched November 2026. Numbers in brackets point to the sources at the end. Anything marked *(unverified)* is inference or comes from a weak source, so test it before relying on it.

The web app (`block.html`) already handles setup, modes, schedules, sessions, stats, puck pairing over Web NFC or QR, and pre-orders. What only a native Android app can do is **actually stop other apps from opening**. This plan covers that app.

---

## 1. How the app blocks other apps

| Approach | Permissions | Verdict |
|---|---|---|
| **AccessibilityService**: watches which app comes to the front and covers blocked apps with a BLOCK screen | User turns it on in Accessibility settings, plus a Play Console declaration [1] | **Primary engine.** Blocks instantly, uses almost no battery, and Android restarts it after a reboot. Brick, Freedom, one sec and ScreenZen use it [6][8][10][11]. Some Xiaomi, Vivo and Oppo phones revoke it [9]. |
| **Usage access polling + overlay**: checks the front app every ~0.9 s | `PACKAGE_USAGE_STATS`, `SYSTEM_ALERT_WINDOW`, a `specialUse` foreground service | **Fallback engine.** Up to ~1 s delay and moderate battery use, and phone makers' battery savers kill it [12][13][43]. Needed for people who refuse accessibility, and for Android 17 Advanced Protection (section 2). |
| Device Owner | Factory reset or adb to provision | Not workable for consumers [14]. |
| VPN | VPN consent plus a declaration [15] | Only cuts the network; the app still opens and shows cached feeds. Skip it. |
| A "Digital Wellbeing" API | Doesn't exist | Android has no public equivalent of Apple's Screen Time [16]. |

**Decision:** one blocking engine with two backends: AccessibilityService first, usage polling as the fallback. The accessibility service draws its block screen as a `TYPE_ACCESSIBILITY_OVERLAY`, so it doesn't need the draw-over-apps permission.

To list installed apps, use a `<queries>` element for launcher apps. **Never** request `QUERY_ALL_PACKAGES` [17][18].

The essentials list (dialer, SMS, WhatsApp, Maps, UPI apps such as GPay, PhonePe and Paytm) is hard-coded as never blockable.

## 2. Google Play rules you must meet

**Accessibility declaration [1]**
- BLOCK is not an "accessibility tool", so **don't** set `isAccessibilityTool`.
- Show a **prominent disclosure** screen in the app, separate from the privacy policy. It must say what is read (the name of the app on screen) and why, and it must offer both Accept and Decline.
- Submit a video showing the disclosure, both choices, and blocking working.
- Developers report rejections for a "missing disclosure" when an old build is left on another testing track [12].

**Foreground service (fallback engine only)**
- Use type `specialUse` with a written reason, plus Play's own declaration and video [2][3].
- On Android 15, a foreground service can't be started from the background through the draw-over-apps exemption unless the overlay is already showing [19].

**Uninstall protection ("strict mode")**
- Make it opt-in, clearly explained, and active only during a session.
- Play's rules say uninstalling must stay "simple, clear and straightforward" [22], so this is a review risk.
- Brick ships the same opt-in pattern [6].

**Alarms**
- Don't declare `USE_EXACT_ALARM`.
- `SCHEDULE_EXACT_ALARM` is off by default from Android 14 [23]. Schedules don't need alarms anyway (see section 6).

**Target SDK:** apps must target API 36 from 31 August 2026 [24].

**New personal developer accounts**
- You need a closed test with **12+ testers for 14 days in a row** before you can publish to production [25].
- Plan for at least two weeks of this.

**Android 17 Advanced Protection** (opt-in) removes accessibility access from apps that aren't accessibility tools, and the user can't give it back [26][27]. The fallback engine exists for this reason.

## 3. The puck (NFC)

**How the app reads the puck**
1. **Main flow: scanning inside the app.** The user opens BLOCK, taps Lock or Unlock, and holds the phone to the puck. The app uses `enableReaderMode`. This avoids recent changes in how Android routes NFC taps.
2. **Bonus: tapping from anywhere.** Write an NDEF message to the tag:
   - first record: an `https` link to BLOCK (iPhone background reading also needs this [28]);
   - an Android Application Record (AAR) for the BLOCK app.

   On Android 16+, tapping an https tag opens it as a normal link. On Android 17, the user must also tap a notification [4]. Treat this as a nice extra, not the main flow.
3. Add a Quick Settings tile that jumps straight to the scan screen.

**Tying the app to one specific puck (in order of strength)**
1. **NTAG213/215 chip.** Check the tag's UID, store a random secret in the tag's data, then lock the tag read-only. This is enough for launch. UID-cloning stickers exist but are fiddly [29].
2. **Add NXP's originality signature check.** This proves the chip is genuine NXP, but not that it's *your* puck [30].
3. **NTAG 424 DNA.**
   - Every tap produces a fresh cryptographic code from the UID and a counter (SUN/SDM) [31][32].
   - About **€0.49–0.92 per tag** retail [33].
   - Its real value is stopping people using ₹10 stickers in place of your puck, which **protects the hardware business**. It doesn't stop a cheater, who can simply buy a second puck.

**Hardware:** a 25–40 mm round inlay in a non-metal shell. A bigger antenna copes better with where different phones put their NFC coil (rule of thumb; test it).

**QR fallback is weak.** A photo of the printed code works just as well as the puck. Suggested rules:
- A QR unlock waits a short delay before unlocking.
- Each QR unlock uses up one emergency unlock.

*(Unverified)* I found no data on how many budget phones sold in India have NFC. Check this before deciding how much to invest in the QR path.

**Web NFC (used in `block.html`)**
- Works in Chrome on Android only.
- The page must be served over HTTPS, as a top-level page, while visible.
- A user tap must start the scan, and `serialNumber` is sometimes empty [34][35].

This is why the web app reads the tag's first record when there's no serial number, and shows a "Start NFC" button if scanning didn't begin automatically.

## 4. iPhone, later

**Blocking**
- Use Apple's Screen Time APIs: FamilyControls with `.individual` authorization, `FamilyActivityPicker`, ManagedSettings shields, and DeviceActivity for schedules.
- To block everything except the essentials, shield all categories with exceptions. This comes from Apple's forums, not its docs, so test it [36].

**Entitlement**
- The app *and every extension* need the Family Controls distribution entitlement from Apple [37][38].
- Developers report waits of 2–3+ weeks [39], so **request it on day one of iOS work**.

**NFC**
- Background tag reading works on iPhone XS and later, after the phone has been unlocked once since boot, using an https link as the first record [28].

**Strict mode**
- `denyAppRemoval` is best effort.
- The user can switch Screen Time access off in Settings at any time [36][40].
- Brick counts switching it off as a bypass that uses up emergency unlocks [41][42]. Do the same.

## 5. Strict mode: what's honest

**What you can do**
- Ask for Device Admin when strict mode is on, so uninstalling needs an extra step [21].
- While a session runs, send the user home if they open BLOCK's App info, Device admin or Accessibility settings pages, or BLOCK's Play Store page. Disclose this.
- Freeze lists and modes during a session (the web app already does this).
- Use `elapsedRealtime` plus server time, so changing the phone's clock doesn't end a session.
- Keep the emergency-unlock count on the server, so clearing app data doesn't reset it.

**What no app can prevent (say so in marketing)**
- Booting into safe mode.
- `adb uninstall` from a computer.
- A factory reset.
- Advanced Protection removing accessibility access.
- Battery savers on some phones killing the app [43].
- Using Instagram or YouTube in a browser.
- *(Unverified)* Clone apps and Android 15 Private Space.

Position BLOCK as **friction, not a jail**, which is how Brick positions itself [42].

## 6. Stack and architecture

**Stack:** Kotlin, Jetpack Compose, Hilt, Room, DataStore, Android Keystore, CameraX + ML Kit (QR). The backend is the **same Supabase project the website uses**, adding accounts, a puck registry and the unlock ledger. Build offline-first.

**Components**
- **`BlockAccessibilityService`:** decides, for each app opened, whether a session is active and whether that app is blocked and not an essential.
- **`UsageWatchService`:** the fallback engine.
- **`NfcScanActivity`:** reader mode, plus the https link entry point.
- **`PolicyRepository` (Room):** modes, apps, schedules, sessions, puck bindings, unlock ledger.
- **`DeviceAdminReceiver`:** strict mode only.

**Schedules**
- Work out "is a schedule window open right now?" every time an app opens, from the stored rules. The web app's `activeWindow()` already does this. No alarm is needed for blocking.
- Use alarms only for the "lock started" notification.
- Use WorkManager for sync, and keep jobs short because Android 16 tightened job quotas [44].

## 7. Phased build plan

Rough estimates for one experienced Android developer.

| Phase | Weeks | Scope |
|---|---|---|
| P0 spike | 1–2 | Accessibility detection and block screen on Xiaomi, Samsung, Vivo and Realme; reader-mode read of an NTAG215 |
| P1 MVP | 5–7 | App picker, essentials allowlist, puck pairing (UID + secret), lock and unlock, onboarding with the prominent disclosure, guides for each phone maker's battery settings |
| P2 | 3–4 | Modes, schedules, 5 emergency unlocks a month, QR fallback, strict mode, the fallback engine |
| P3 Play compliance | 2–3, plus the 14-day closed test | Declarations and videos, Data safety form, privacy policy |
| P4 | 3–4 | NTAG 424 DNA provisioning and verification, accounts, sync with Supabase |
| P5 iPhone | 8–12 | Swift/SwiftUI with Screen Time and Core NFC. Request the entitlement at the very start |

**Biggest risks:** Play rejecting the accessibility declaration, phone makers killing the app in the background, and Advanced Protection adoption.

## Sources
1. https://support.google.com/googleplay/android-developer/answer/10964491?hl=en
2. https://developer.android.com/develop/background-work/services/fgs/service-types
3. https://support.google.com/googleplay/android-developer/answer/13392821
4. https://developer.android.com/develop/connectivity/nfc/nfc
5. https://developer.android.com/about/versions/15/behavior-changes-15
6. https://support.getbrick.com/en/articles/7950977
7. https://www.irishtimes.com/technology/consumer-tech/review/2025/11/13/brick-review-this-simple-device-helped-me-halve-my-screen-time
8. https://support.freedom.to/en/articles/6350161-freedom-for-android-app-options-explained
9. https://support.freedom.to/en/articles/4529927-freedom-for-android-troubleshooting
10. https://tutorials.one-sec.app/android-accessibility-permission
11. https://play.google.com/store/apps/details?id=com.screenzen
12. https://dev.to/lui61140/why-i-removed-accessibilityservice-from-my-android-app-and-finally-got-into-play-store-4i52
13. https://dev.to/rexa/how-to-block-apps-on-android-without-an-accessibilityservice-5gog
14. https://developers.google.com/android/work/device-admin-deprecation
15. https://support.google.com/googleplay/android-developer/answer/12564964
16. https://habitdoom.com/blog/best-screen-time-apps-android (secondary source)
17. https://developer.android.com/training/package-visibility/declaring
18. https://support.google.com/googleplay/android-developer/answer/10158779
19. https://developer.android.com/develop/background-work/services/fgs/changes
20. https://developer.android.com/guide/components/activities/background-starts
21. https://developer.android.com/work/device-admin
22. https://developers.google.com/android/play-protect/mobile-unwanted-software
23. https://developer.android.com/about/versions/14/changes/schedule-exact-alarms
24. https://support.google.com/googleplay/android-developer/answer/11926878
25. https://support.google.com/googleplay/android-developer/answer/14151465
26. https://thehackernews.com/2026/10/android-17-advanced-protection-locks.html
27. https://www.malwarebytes.com/blog/mobile/2026/03/google-cracks-down-on-android-apps-abusing-accessibility
28. https://developer.apple.com/documentation/corenfc/adding-support-for-background-tag-reading
29. https://lab401.com/en-it/products/ntag-compatible-213-direct-write-uid
30. https://gototags.com/help/nfc/chip/features/originality-signature
31. https://www.nxp.com/products/NTAG424DNA
32. https://www.wakdev.com/en/knowledge-base/nfc-chips/nxp-ntag424-dna.html
33. https://www.shopnfc.com/en/nfc-stickers/313-nfc-stickers-ntag424-dna-29mm.html and https://www.shopnfc.com/en/nfc-stickers/487-nfc-stickers-ntag424-dna-d22mm.html
34. https://developer.chrome.com/docs/capabilities/nfc
35. https://developer.mozilla.org/docs/Web/API/NDEFReadingEvent/serialNumber
36. https://developer.apple.com/forums/thread/729637
37. https://developer.apple.com/documentation/xcode/configuring-family-controls
38. https://developer.apple.com/forums/thread/828085
39. https://developer.apple.com/forums/thread/821964
40. https://developer.apple.com/forums/thread/820796
41. https://www.theblaze.com/tech/how-to-block-distractions-on-your-phone
42. https://techcrunch.com/2026/06/24/if-you-want-to-cut-your-screen-time-just-get-a-brick/
43. https://dontkillmyapp.com/
44. https://developer.android.com/about/versions/16/behavior-changes-all
