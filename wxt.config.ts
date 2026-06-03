import { defineConfig } from 'wxt';

// wxt.dev config — Manifest V3, React + Tailwind.
//
// host_permissions: <all_urls> is justified because the extension must
// detect AI agents on any site the user visits. We do not collect or
// transmit page contents; only locally-extracted passport tokens are
// sent to verify.agentpki.dev.
//
// declarativeNetRequest is used (not webRequest) so we can observe
// AgentPKI-Token response headers without needing blocking permissions.

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: ({ browser }) => ({
    name: 'AgentPKI',
    short_name: 'AgentPKI',
    // Chrome Web Store enforces a 132-char hard limit on this field. Keep
    // any future edits short — count chars before pushing.
    description:
      'The HTTPS padlock for AI agents in your browser. Tells you if the agent on this page is verified, unverified, or revoked.',
    permissions: [
      'activeTab',
      'storage',
      'scripting',
      'webRequest', // observation-only — needed for AgentPKI-Token response header detection
      'webNavigation', // for resetting tab state on page refresh / navigation
    ],
    host_permissions: ['<all_urls>'],
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      96: 'icon/96.png',
      128: 'icon/128.png',
    },
    action: {
      default_title: 'AgentPKI — AI Agent Verification',
      default_popup: 'popup.html',
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
      },
    },
    options_ui: {
      page: 'options.html',
      open_in_tab: true,
    },
    minimum_chrome_version: '116', // declarativeNetRequest responseHeaders condition needs 116+
    ...(browser === 'firefox'
      ? {
          // v0.2 — Firefox manifest tweaks land here. v0.1 ships Chrome-only
          // but we keep the cross-browser surface area open from day one.
        }
      : {}),
  }),
  runner: {
    // For local dev — opens a fresh profile so existing logins don't pollute
    // detection of agents.
    disabled: false,
  },
});
