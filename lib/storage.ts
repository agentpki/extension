// chrome.storage wrappers for v0.1 state.
//
// Local-only:
//   - installation_id    (UUID — used as `reporter` in abuse reports)
//   - activity_log       (rolling buffer, last 200 entries)
//   - per-tab cache      (in-memory in the SW + persisted briefly to local)
//
// Sync (when signed in):
//   - user_lists         (block/whitelist)
//   - settings

import type {
  ActivityLogEntry,
  UserLists,
  Settings,
} from './types';

const KEY_INSTALL_ID = 'agentpki:install_id';
const KEY_USER_LISTS = 'agentpki:user_lists';
const KEY_SETTINGS = 'agentpki:settings';
const KEY_ACTIVITY = 'agentpki:activity_log';

const ACTIVITY_LOG_MAX = 200;

/** Get-or-generate the installation UUID. Stored in storage.local so it
 *  survives across restarts but doesn't sync across machines (each install
 *  is its own reporter). */
export async function getInstallationId(): Promise<string> {
  const existing = await chrome.storage.local.get(KEY_INSTALL_ID);
  const v = existing[KEY_INSTALL_ID];
  if (typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
    return v;
  }
  const fresh = crypto.randomUUID();
  await chrome.storage.local.set({ [KEY_INSTALL_ID]: fresh });
  return fresh;
}

export const DEFAULT_USER_LISTS: UserLists = {
  blocked_agents: [],
  blocked_issuers: [],
  blocked_domains: [],
  whitelisted_agents: [],
  whitelisted_issuers: [],
  own_agents: [],
};

export const DEFAULT_SETTINGS: Settings = {
  in_page_overlay: true,
  anonymous_telemetry: false,
};

export async function getUserLists(): Promise<UserLists> {
  const { [KEY_USER_LISTS]: v } = await chrome.storage.sync.get(KEY_USER_LISTS);
  if (v && typeof v === 'object') return { ...DEFAULT_USER_LISTS, ...(v as UserLists) };
  return DEFAULT_USER_LISTS;
}

export async function setUserLists(lists: UserLists): Promise<void> {
  await chrome.storage.sync.set({ [KEY_USER_LISTS]: lists });
}

export async function getSettings(): Promise<Settings> {
  const { [KEY_SETTINGS]: v } = await chrome.storage.sync.get(KEY_SETTINGS);
  if (v && typeof v === 'object') return { ...DEFAULT_SETTINGS, ...(v as Settings) };
  return DEFAULT_SETTINGS;
}

export async function setSettings(s: Settings): Promise<void> {
  await chrome.storage.sync.set({ [KEY_SETTINGS]: s });
}

export async function appendActivity(entry: ActivityLogEntry): Promise<void> {
  const { [KEY_ACTIVITY]: existing } = await chrome.storage.local.get(KEY_ACTIVITY);
  const log = Array.isArray(existing) ? (existing as ActivityLogEntry[]) : [];
  log.push(entry);
  // Trim to rolling-window size
  if (log.length > ACTIVITY_LOG_MAX) log.splice(0, log.length - ACTIVITY_LOG_MAX);
  await chrome.storage.local.set({ [KEY_ACTIVITY]: log });
}

export async function getActivity(): Promise<ActivityLogEntry[]> {
  const { [KEY_ACTIVITY]: v } = await chrome.storage.local.get(KEY_ACTIVITY);
  return Array.isArray(v) ? (v as ActivityLogEntry[]) : [];
}
