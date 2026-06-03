# Screenshot capture guide — Chrome Web Store submission

Chrome Web Store requires 1–5 screenshots at **1280×800** (no scaling, no
text overlay imposed by them). These five tell the product story end-to-end.

## Setup (once)

1. **Use a clean Chrome profile** (no other extensions in toolbar — they steal pixels and confuse reviewers)
2. **Window size: exactly 1280×800.** Use DevTools → device-toolbar → Responsive → set 1280×800
3. **Build + load production extension**:
   ```powershell
   cd C:\Users\User\agentpki\extension; pnpm build
   # then chrome://extensions/ → Load unpacked → .output/chrome-mv3/
   ```
4. **Demo page**: open `https://agentpki.dev/demo` in the test window
5. **Capture tool**: Windows Snipping Tool (Win+Shift+S) → rectangular snip → save as PNG. Or use Chrome DevTools → Cmd Shift P → "Capture full size screenshot" then crop to 1280×800.

## Screenshot 1 — Verified ✓ (the hero shot)

**File**: `01-verified.png`
**Caption**: *"Verified ✓ — the agent's cryptographic identity is proven"*

**Steps**:
1. Open the demo page
2. Click the "Mint a verified passport" demo button (or paste the meta-tag inject from README)
3. Wait for badge to turn green
4. Click the AgentPKI icon — popup opens
5. Capture the full window including (a) some demo-page content behind, (b) the popup with: green badge, Issuer `demo.agentpki.dev` with ✓ Verified pill, Agent ID, Scopes, Tier, **Reputation row showing Clean · 0 reports filed**

## Screenshot 2 — Unverified !

**File**: `02-unverified.png`
**Caption**: *"Yellow when an agent shows up without a passport"*

**Steps**:
1. Hard-refresh the demo page (Ctrl+Shift+R) → badge gray
2. In DevTools Console: `window.__LANGCHAIN__ = { fake: true };`
3. Wait 3 seconds for the MAIN-world scan to pick it up → badge yellow
4. Click the icon → popup shows "Detected 1 signal on this page (js_library). No verifiable token attached."
5. Capture

## Screenshot 3 — Revoked ⛔

**File**: `03-revoked.png`
**Caption**: *"Red when an agent is revoked or reported"*

**Steps**:
1. Hard-refresh → gray
2. Paste in Console:
   ```js
   const r = await (await fetch('https://demo.agentpki.dev/mint?revoked=1')).json();
   const m = document.createElement('meta');
   m.name='agentpki-passport';
   m.content=r.token;
   document.head.appendChild(m);
   ```
3. Badge turns red
4. Click icon → popup shows: red badge, the revoked passport details, Reason: `revoked_key`
5. Capture

## Screenshot 4 — Report abuse modal

**File**: `04-report-modal.png`
**Caption**: *"One-click anonymous abuse reports"*

**Steps**:
1. Get a verified token on a tab (Screenshot 1 setup)
2. Click icon → click **🚩 Report abuse**
3. Modal opens. Type a real-sounding description (15–30 words). Pick category = Impersonation, severity = Medium
4. Capture popup with modal in foreground showing the populated form

## Screenshot 5 — Activity log + lists

**File**: `05-activity.png`
**Caption**: *"Full activity log + lists — never leaves your browser"*

**Steps**:
1. Have done several tests so the activity log has 5–10 entries
2. Click icon → "Activity & Settings ⚙"
3. New tab opens. Scroll so the visible viewport shows: Blocked agents card (with 1–2 entries), Activity log card with filter chips, 4–5 log rows beneath
4. Capture (will need to crop the 1280×800 viewport — set window size accordingly before navigating)

## Final check before upload

- [ ] All 5 PNGs are exactly 1280×800 (right-click → Properties on Windows)
- [ ] No personal info in the screenshots (your email, browser sync bookmarks, etc.)
- [ ] Demo URL + popup are the only visible chrome — close DevTools before capturing
- [ ] Save all five under `extension/store-assets/screenshots/` (create the folder)
- [ ] Optional: open each in an image viewer at 100% to confirm legibility — captions in store-listing.md will reference these
