# Changelog

All notable changes to the AgentPKI Chrome extension.

The format is based on [Keep a Changelog](https://keepachangelog.com).
Versioning per [SemVer](https://semver.org).

## [0.1.0-alpha.1] — 2026-06-09

Initial Chrome Web Store submission. Free, open source, zero telemetry.

### Detection vectors

- `<meta name="agentpki-passport">` page meta tag (highest signal)
- `AgentPKI-Token:` response header observation via `chrome.webRequest`
- RFC 9421 HTTP Message Signatures on outbound `fetch` and `XMLHttpRequest`
  (MAIN-world content script patches both APIs at `document_start`)
- JavaScript-library fingerprints for LangChain.js, Vercel AI SDK,
  Anthropic SDK, OpenAI Agents JS, CrewAI JS, Mastra (MAIN-world, 2s
  rescan loop, CSP-bypassed)

### Verification + reputation

- Verifies detected tokens against `verify.agentpki.dev/v1/verify`
- Trusted-issuer "✓ Verified" pill resolved from `/v1/trusted-issuers`
  (5-min in-memory cache)
- Per-passport reputation from `/v1/passport/:id/reputation` with
  count + last-report timestamp + colored severity label (Clean →
  High-confidence bad)
- Fresh re-fetch (`?fresh=1`) bypasses verifier edge cache after the
  user submits a report, so the count visibly increments within ~1 s

### Badge state machine

- 🟢 Green ✓ — verified
- 🟡 Yellow ! — agent present but unverified
- 🔴 Red ⛔ — revoked, high-abuse, or in user block list
- 🔵 Blue 👤 — user's own agent
- ⬛ Gray — no agent detected
- ⚪ White ? — token present, verifying

### User-facing flows

- 2×2 action grid in the popup: Block/Unblock agent, Block/Unblock
  issuer, This is my agent / Not my agent, 🚩 Report abuse
- Report-abuse modal: category (impersonation / fraud / harm / scope
  violation / rate abuse / spam / other), severity (low / medium /
  high / critical), description (10..1000 chars), optional page-URL
  evidence checkbox. ESC closes, textarea autofocuses
- Anonymous reporter UUID generated once per install, used as the
  `reporter` field on abuse reports — no signing, no account, no email

### Options page

- Activity log with verdict filter chips (All / Verified / Throttled /
  Denied / No-token / Unknown), each showing count
- 200-entry rolling buffer, downloadable as JSON
- List management: Your own agents, Blocked agents, Blocked issuers —
  per-item Remove buttons
- Advanced settings: verifier-base URL override
- Danger zone: two-step "Clear all local data" wipes
  `chrome.storage.sync` + `.local` + `.session`

### Technical foundation

- Manifest V3, Chrome 116+
- WXT 0.19.29 (Vite 6)
- TypeScript strict (`noUncheckedIndexedAccess`, `noImplicitOverride`)
- React 18 + Tailwind 3
- Tab-state reset on `chrome.webNavigation.onCommitted` so refresh
  doesn't carry stale verifications forward
- Background SW state persisted to `chrome.storage.session` for MV3
  termination resilience
- Cross-context messaging via discriminated `ExtensionMessage` union
- Permissions: `activeTab`, `storage`, `scripting`, `webRequest`
  (observation-only), `webNavigation`, `host_permissions: <all_urls>`

### Privacy

- No telemetry. Permanently disabled in v0.1 (toggle grayed out).
- No personal data collected anywhere.
- Only the passport token itself is sent to `verify.agentpki.dev`.
- Page URLs, page contents, browsing history: never collected.
- Source MIT-licensed on github.com/agentpki/extension.
- Full policy at agentpki.dev/privacy.

### Build outputs

- Total bundle 235 kB
- 5 icon sizes (16/32/48/96/128 PNG)
- 2 promo tiles (440×280 small, 1400×560 marquee) rendered from SVG

### Known limitations

- Chrome-only. Firefox / Safari / Edge are v0.2+ targets.
- No in-page overlay yet (visualizing an agent on the page beyond the
  toolbar badge) — v0.2.
- Library detection scans only the 6 most popular agent frameworks.
- Reputation read-modify-write on the summary counter can undercount
  by 1 in rare concurrent-report races (acceptable for an abuse
  signal; durable per-report records are written first as the source
  of truth).
