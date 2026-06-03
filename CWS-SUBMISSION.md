# Chrome Web Store submission — step-by-step

End-to-end checklist for shipping AgentPKI v0.1.0-alpha.1 to the store.

## Before you start

You need:
- A Google account
- $5 one-time CWS developer registration fee (Google charges this on first publish)
- The production zip: `.output/agentpkiextension-0.1.0-alpha.1-chrome.zip`
- The 5 screenshots in `store-assets/screenshots/`
- The promo tile PNGs in `public/promo/`
- ~30 minutes of focused time

Have these tabs open before starting:
- This file (`CWS-SUBMISSION.md`) — the walkthrough
- `store-listing.md` — paste-ready descriptions
- File Explorer showing `C:\Users\User\agentpki\extension\.output\`

---

## Step 1 — Sign in to the Chrome Web Store Developer Dashboard

1. Open <https://chrome.google.com/webstore/devconsole>
2. Sign in with the Google account that will own the listing. **This account becomes the listed publisher** — choose accordingly. (For AgentPKI use the account associated with `hello@agentpki.dev` if you have one, otherwise your primary.)
3. If this is your first time:
   - You'll be prompted to pay the **$5 one-time registration fee** by credit card
   - Accept the developer agreement
   - You may be asked to verify with a code via SMS or email

You should land on the dashboard with an empty "Your items" list.

---

## Step 2 — Account-level verification (one-time)

In the left sidebar, click **Account**.

1. Click **Verify your account** if prompted (Google sends a confirmation email)
2. Fill in publisher details:
   - **Publisher display name**: `AgentPKI` (or your real name if going personal)
   - **Trader status**: "Non-trader" is fine for v0.1 since this is free and you're not selling anything
   - **Contact email**: `hello@agentpki.dev` (must be reachable; users see it on the listing)

3. Click **Save**. Account verification can take a moment but is usually instant.

---

## Step 3 — Create the new item

1. Click **Items** in the left sidebar
2. Click **+ New item** (top-right)
3. Drag-and-drop or browse to:
   ```
   C:\Users\User\agentpki\extension\.output\agentpkiextension-0.1.0-alpha.1-chrome.zip
   ```
4. CWS validates the zip. If it passes (it should — clean build, MV3, all icons present), you land on the item edit page.

If you get a validation error here, paste the error message back to me. Common causes:
- Manifest version mismatch (we ship MV3 — fine)
- Missing required icons (we ship all 5 sizes — fine)
- Permissions not in the allowed set (we use only standard ones — fine)

---

## Step 4 — Store listing tab

This is the main paste-fest. Have `store-listing.md` open in another window.

### Product details

| Field | Paste from `store-listing.md` |
|---|---|
| **Name** | `AgentPKI` |
| **Short description** (132 char limit) | Section "**Short description**" — the 131-char line starting "The HTTPS padlock for AI agents…" |
| **Category** | `Productivity` |
| **Language** | `English (United States)` |
| **Detailed description** | Section "**Detailed description**" — the ~2200-character block |

### Graphic assets

Upload from:
```
C:\Users\User\agentpki\extension\
```

| Field | File | Required |
|---|---|---|
| **Store icon** (128×128) | `public/icon/128.png` | ✅ Required |
| **Small promo tile** (440×280) | `public/promo/small-440x280.png` | ✅ Required |
| **Marquee promo tile** (1400×560) | `public/promo/marquee-1400x560.png` | Optional but recommended |

### Screenshots

CWS allows up to 5. Upload all 5 from:
```
C:\Users\User\agentpki\extension\store-assets\screenshots\
```

| Order | File | Caption (paste in CWS caption field) |
|---|---|---|
| 1 | `01-verified.png` | `Verified ✓ — the agent's cryptographic identity is proven` |
| 2 | `02-unverified.png` | `Yellow when an agent shows up without a passport` |
| 3 | `03-revoked.png` | `Red when an agent is revoked or reported` |
| 4 | `04-report-modal.png` | `One-click anonymous abuse reports` |
| 5 | `05-activity.png` | `All detection events stay on your device — filterable, exportable, never sent anywhere` |

**Order matters** — Screenshot 1 is shown as the lead. Drag to reorder if CWS uploads them out of order.

### Additional fields

| Field | Value |
|---|---|
| **Official URL / Homepage URL** | `https://agentpki.dev` |
| **Support URL** | `https://github.com/agentpki/extension/issues` |
| **YouTube URL** | (leave blank for v0.1) |

Click **Save draft** at the bottom-right.

---

## Step 5 — Privacy practices tab

This is the section that triggers most rejections, so be precise.

### Single purpose

Paste from `store-listing.md` → "Single-purpose statement":
```
AgentPKI's single purpose is to verify the cryptographic identity of
AI agents present on webpages and display a trust badge in the
browser toolbar.
```

### Permission justifications

For each permission listed, paste the matching block from `store-listing.md` → "Permissions justification" section.

| Permission shown in CWS | Paste this justification |
|---|---|
| `activeTab` | "Used to display agent verification info for the page the user is actively viewing…" |
| `storage` | "Stores the user's own/blocked agent lists, anonymous installation UUID…" |
| `scripting` | "Required for the MAIN-world content script that detects agent-framework JavaScript globals…" |
| `webRequest` | "Watches HTTP response headers for the `AgentPKI-Token:` header…" (emphasize **observation-only, no blocking**) |
| `webNavigation` | "Resets per-tab agent state when the user navigates or refreshes…" |
| **Host permission: `<all_urls>`** | "AI agents can run on any website, so detection must run on any website…" (emphasize **single network call per detection, never page contents**) |

### Data usage

A separate set of toggles. Set:

- [ ] **Personally identifiable information** — UNCHECKED (we don't collect any)
- [ ] **Health information** — UNCHECKED
- [ ] **Financial and payment information** — UNCHECKED
- [ ] **Authentication information** — UNCHECKED
- [ ] **Personal communications** — UNCHECKED
- [ ] **Location** — UNCHECKED
- [ ] **Web history** — UNCHECKED
- [ ] **User activity** — UNCHECKED (this asks about analytics tracking — we don't do this)
- [ ] **Website content** — UNCHECKED (we never read DOM contents)

Then check the three declarations:
- [x] I do not sell or transfer user data to third parties
- [x] I do not use or transfer user data for purposes unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

### Privacy policy URL

```
https://agentpki.dev/privacy
```

Make sure this URL loads before submitting. (We deployed it in Day 5 — verify with a fresh browser tab.)

Click **Save draft**.

---

## Step 6 — Distribution tab

| Field | Value |
|---|---|
| **Visibility** | `Public` (anyone can find + install) |
| **Geographic distribution** | `All regions` |
| **Excluded regions** | (none) |
| **Pricing** | `Free` |

Click **Save draft**.

---

## Step 7 — Submit for review

Top-right: click **Submit for review**.

CWS shows a confirmation dialog summarizing what you're submitting. Read it once, then confirm.

You'll see the item move from "Draft" to "Pending review" status.

### What to expect

- **Typical review time**: 1–3 business days for v0.1 first submissions. Can stretch to 7 days for complex permission sets like `<all_urls>`.
- **Possible outcomes**:
  - **Approved + Published** — congrats, you're live on the store
  - **Approved + Unpublished** — rare; means submission passed but you toggled visibility off
  - **Rejected** — CWS sends an email with the specific reason

### Most common rejection reasons (and how to fix)

| Reason | Fix |
|---|---|
| **Privacy policy doesn't mention X** | Update `web/src/pages/privacy.astro`, redeploy with `pnpm run release` |
| **Permission too broad** | Justification text was unclear. Beef up the relevant justification field — reviewers re-read these. |
| **Permission unused in code** | Manifest declares something we don't use. Should not happen — our wxt.config is tight. |
| **Doesn't match described single purpose** | Re-read the single-purpose statement. If it's truthful, dispute via the appeal link in the rejection email. |
| **Branding violation** | We don't claim affiliation with Anthropic / OpenAI / etc., so this shouldn't hit. If a reviewer flags the library names (LangChain.js etc.), explain in the appeal that they're detection targets, not claims of endorsement. |

---

## Step 8 — While waiting

Tasks for the review window:

- [ ] Tag the GitHub release on `extension`:
  ```bash
  cd C:\Users\User\agentpki\extension
  git tag v0.1.0-alpha.1
  git push --tags
  ```
- [ ] Draft your HN post locally — **do NOT submit it until CWS approves**. Once you have a working store URL the post writes itself.
- [ ] Cross-post the privacy URL to your `/why` page if not already linked
- [ ] Update the homepage CTA on `agentpki.dev` to point to the store install URL (once approved)

---

## Step 9 — After approval

CWS sends an approval email with your store URL. It'll look like:
```
https://chromewebstore.google.com/detail/agentpki/<abcdef123456>
```

1. **Install it on a fresh browser profile** — make sure it actually works end-to-end through the public store path, not just unpacked
2. **Update agentpki.dev homepage CTA** to that URL
3. **Update the README badges** on `github.com/agentpki/extension` (add a "Available on the Chrome Web Store" badge)
4. **Now is HN-post time**. Title suggestion:
   > Show HN: AgentPKI – the HTTPS padlock for AI agents in your browser

If rejected, paste the rejection email to me and we'll fix and resubmit.

---

## Day 7 final checklist (before clicking Submit)

- [ ] Zip exists at `.output/agentpkiextension-0.1.0-alpha.1-chrome.zip`
- [ ] 5 screenshots saved at `store-assets/screenshots/01..05-*.png`
- [ ] Both promo PNGs exist at `public/promo/*.png`
- [ ] `agentpki.dev/privacy` loads in a fresh browser tab (deployed Day 5)
- [ ] CHANGELOG.md up to date
- [ ] CWS developer account paid + verified
- [ ] Account email matches one you actually check (`hello@agentpki.dev` recommended)
- [ ] You have `store-listing.md` open in another window for paste-by-paste fields
- [ ] You have ~30 minutes uninterrupted
