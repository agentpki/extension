# Chrome Web Store listing — AgentPKI

Paste-in-ready copy for Chrome Web Store submission. Used by `pnpm zip` output.

## Item details

**Name** — AgentPKI

**Short description** (132 char max, shown in tile + search)
```
The HTTPS padlock for AI agents. See whether an AI agent on the page is who it claims to be — verified ✓, unverified !, or revoked ⛔.
```
> 131 characters. Targets non-technical users.

**Category** — Productivity (primary). Secondary if allowed: Developer Tools.

**Language** — English

## Detailed description

```
AgentPKI is the HTTPS padlock for AI agents. As more websites become
home to autonomous AI bots — booking your appointments, scraping
prices, calling customer support — you have no way to tell which
ones are real. AgentPKI fixes that.

Install it, and a small badge appears in your toolbar:

 • ✓ Green — the agent on this page presented a cryptographically
   verified passport from a known issuer. It is who it claims to be.

 • ! Yellow — an AI agent is running on this page, but it didn't
   present a verifiable passport. Treat it like an http:// website
   in 2026: probably fine, but you can't tell.

 • ⛔ Red — the agent's passport was revoked, has been reported for
   abuse, or you've added it to your block list. Close the tab.

 • 👤 Blue — this is one of your own agents (you marked it that way
   in the popup).

Click the badge to see who issued the passport, what the agent is
authorised to do, its reputation across the network, and a one-click
abuse-reporting form when something is off.

HOW IT WORKS
The extension watches for four signals on every page:
  1. A <meta name="agentpki-passport"> tag in the HTML.
  2. An "AgentPKI-Token:" response header.
  3. A signed outbound request per IETF RFC 9421 (HTTP Message
     Signatures).
  4. A known agent-framework's JavaScript globals (LangChain.js,
     Vercel AI SDK, Anthropic SDK, OpenAI Agents JS, CrewAI, Mastra).

Detected tokens are verified against the public AgentPKI verifier at
verify.agentpki.dev, which returns a verdict in roughly 100ms.

PRIVACY
We collect nothing. No telemetry, no account, no email, no IP
retention. Detection happens locally in your browser. Only the
agent's passport token itself is sent to verify.agentpki.dev — never
the page URL, never the page contents, never your browsing history.
Abuse reports identify you by a random UUID generated once per
install. Full policy at agentpki.dev/privacy.

OPEN SOURCE
Every line of code is MIT-licensed and visible:
  github.com/agentpki/extension — the extension itself
  github.com/agentpki/verifier — the verifier service

WHAT IS AGENTPKI?
AgentPKI is a chain-agnostic public-key infrastructure for AI agents:
a way for any agent to prove which issuer minted it, what scopes it
has, and that it has not been revoked. The spec is at
agentpki.dev/spec — open standard, no proprietary lock-in.

QUESTIONS
Email hello@agentpki.dev or open an issue on GitHub.
```

> ~2,200 characters. CWS allows up to 16,000.

## Permissions justification

CWS asks why each permission is needed. Paste these verbatim into the
"single purpose" + "permission justification" sections.

**activeTab** — Used to display agent verification info for the page
the user is actively viewing when they click the extension icon. Does
not access background tabs.

**storage** — Stores the user's own/blocked agent lists, anonymous
installation UUID (used only for abuse reports), settings, and a
rolling 200-entry activity log. All data lives locally on the user's
device.

**scripting** — Required for the MAIN-world content script that
detects agent-framework JavaScript globals on the page. Without it
the extension cannot fingerprint LangChain.js / Vercel AI SDK /
Anthropic SDK etc.

**webRequest (observation-only, no blocking)** — Watches HTTP response
headers for the `AgentPKI-Token:` header which servers may emit to
signal that an AI agent generated the response. The listener never
blocks or modifies a request.

**webNavigation** — Resets per-tab agent state when the user navigates
or refreshes, so a verified badge from a previous page doesn't linger
into an unrelated page.

**host_permissions: <all_urls>** — AI agents can run on any website,
so detection must run on any website. The extension makes ONE network
call per page-load (to verify.agentpki.dev) ONLY when a passport is
detected on the page. It does not exfiltrate page content, URLs, or
any data from any site.

## Single-purpose statement

```
AgentPKI's single purpose is to verify the cryptographic identity of
AI agents present on webpages and display a trust badge in the
browser toolbar.
```

## Privacy URL

```
https://agentpki.dev/privacy
```

## Homepage URL

```
https://agentpki.dev
```

## Support URL

```
https://github.com/agentpki/extension/issues
```

## Search keywords (limit ~5)

- AI agent verification
- agent identity
- bot detection
- AgentPKI
- agent trust badge

## Screenshot caption ideas (1280x800 each, need 1–5)

1. **"Verified ✓ — the agent's identity is cryptographically proven"**
   Hero shot of the popup on a real-looking page with the green badge,
   issuer + agent + scopes visible.

2. **"Yellow when an agent shows up without a passport"**
   Same layout, yellow badge, "no verifiable token attached" subtext.

3. **"Red when an agent is revoked or reported"**
   Red badge with reason ("revoked_key") visible.

4. **"One-click anonymous abuse reports"**
   The Report-abuse modal open with the form populated.

5. **"Local activity log — never leaves your browser"**
   Options page showing the activity log with filter chips.

## Promo tile (440x280, required)

Centered violet AgentPKI shield icon, headline:
> Verify AI agents in your browser.
> Free. Open source. Zero telemetry.

## Marquee promo tile (1400x560, optional but increases visibility)

Three-panel storyboard:
  Left: yellow badge + "An AI agent is here"
  Middle: green badge + "It's verified ✓"
  Right: red badge + "It's been reported ⛔"

## Submission checklist

- [ ] `pnpm icons` to refresh PNG sizes
- [ ] `pnpm check && pnpm build` — no errors
- [ ] `pnpm zip` — generates `.output/chrome-mv3.zip`
- [ ] Test against demo.agentpki.dev one more time (green path)
- [ ] Privacy URL `agentpki.dev/privacy` deployed and reachable
- [ ] Screenshots taken (5 × 1280x800)
- [ ] Promo tile rendered (440x280)
- [ ] Marquee promo tile rendered (1400x560, optional)
- [ ] CWS developer account active + $5 fee paid
- [ ] Upload zip + paste descriptions + answer permission justifications
- [ ] Submit for review (typical wait: 2–7 days)
