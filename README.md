# AgentPKI — Chrome extension

**AI Agent Verification.** Detects AI agents on any webpage, verifies their cryptographic identity against the [AgentPKI](https://agentpki.dev) standard, surfaces a trust badge so users can tell at a glance which agents are real.

Think of it as the HTTPS padlock for the agent era.

| Badge | Meaning |
|---|---|
| ✓ green | Verified agent, clean reputation, not revoked |
| ! yellow | Agent detected, but no AgentPKI passport — or unverified |
| ⛔ red | Revoked or high abuse score — close the tab |
| 👤 blue | Your own agent (in your whitelist) |
| (gray) | No agent on this page |

## Status

v0.1 alpha — under active development. Targeting Chrome Web Store submission in ~7 days from first commit.

## How it works

- Runs a content script on every page (`<all_urls>`)
- Detects agents via:
  1. `<meta name="agentpki-passport" content="...">` tags
  2. `AgentPKI-Token:` response headers (via `declarativeNetRequest`)
  3. Known agent JS-library globals (LangChain.js, Vercel AI SDK, Anthropic SDK, OpenAI Agents JS, CrewAI JS, Mastra)
  4. RFC 9421 outbound HTTP Message Signatures (via injected MAIN-world fetch interceptor)
- Background service worker calls [`verify.agentpki.dev`](https://verify.agentpki.dev) `/v1/verify` with detected tokens
- Caches verdicts in `chrome.storage.session` for the verdict's `cached_until` window
- Paints the toolbar badge per the table above
- Click the badge to open a popup with: issuer, agent_id, scopes, tier, abuse score, reputation, recent activity
- Anonymous abuse reports via UUID installation-id (no PII, no signing, no account)

## Privacy

- No PII collected, anywhere.
- No telemetry by default. Cannot be enabled in v0.1.
- The only thing sent to AgentPKI is the agent's passport token — for verification — and a randomly-generated installation UUID when you submit an abuse report.
- All blocklists, whitelists, settings, and activity logs live in your browser's local storage.
- Source is [MIT-licensed](./LICENSE).

## Build + run locally

Requires Node 20+ and either `pnpm`, `npm`, or `bun`.

```bash
git clone https://github.com/agentpki/extension.git
cd extension
pnpm install
pnpm icons        # one-shot: rasterize public/icon.svg into PNG sizes
pnpm dev          # Chrome, runs WXT dev mode
```

This opens a Chrome window with the extension auto-loaded. Edit any file under `entrypoints/` or `lib/` and the extension reloads. To produce a Chrome Web Store-ready zip:

```bash
pnpm build
pnpm zip
```

The packaged `.zip` lands in `.output/<browser>-mv3.zip`.

## Stack

- [wxt.dev](https://wxt.dev) — Manifest V3, multi-browser scaffolding, HMR
- TypeScript
- React 18 + Tailwind for the popup and options pages
- `@agentpki/sdk` for PASETO v4 token parsing
- Web Crypto API (browser-native, no library needed in v0.1)

## Scope of v0.1

In scope:
- Detection vectors (1) (2) (3) (4) listed above
- Verify integration + badge state machine
- Popup details view
- UUID-based abuse reporting
- Per-tab block/whitelist
- Activity log (200-entry rolling buffer)
- Chrome only

Out of scope (v0.2+):
- Firefox / Safari / Edge
- Mobile (Android via Firefox)
- Email plugins
- Voice agent verification (waits for AgentPKI Voice)

## Repository layout

```
extension/
├── entrypoints/
│   ├── content.ts          # content script, runs on every page
│   ├── background.ts       # MV3 service worker
│   ├── popup/              # React popup UI
│   └── options/            # React full-page settings UI
├── lib/
│   ├── types.ts            # shared types
│   ├── verifier.ts         # verify.agentpki.dev client
│   ├── detect.ts           # detection vectors
│   └── storage.ts          # chrome.storage wrappers
├── public/                 # static assets (icons land here)
├── wxt.config.ts           # WXT framework config (manifest, permissions)
├── tailwind.config.js
├── postcss.config.js
└── package.json
```

## License

MIT — see [LICENSE](./LICENSE).
