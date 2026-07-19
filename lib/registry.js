/**
 * Registry manager — tracks multiple grok accounts, their metadata,
 * and which account is currently active.
 *
 * Registry file: ~/.grok/accounts/grok-auth-registry.json
 *
 * Schema:
 * {
 *   "schema_version": 1,
 *   "active_account_key": "<key>",
 *   "previous_account_key": "<key>",
 *   "accounts": [
 *     {
 *       "key": "<issuer>::<client_id>",
 *       "email": "user@example.com",
 *       "name": "First Last",
 *       "user_id": "...",
 *       "team_id": "...",
 *       "auth_mode": "oidc",
 *       "alias": "",
 *       "created_at": 1234567890,
 *       "last_used_at": 1234567890
 *     }
 *   ]
 * }
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  copyFileSync,
  unlinkSync,
} from "node:fs";
import { dirname } from "node:path";
import {
  registryPath,
  accountsDir,
  accountBackupPath,
} from "./config.js";
import {
  readAuthJson,
  writeAuthJson,
  displayName,
  displayEmail,
} from "./auth.js";

const SCHEMA_VERSION = 1;

/**
 * Load the registry, or create a default one.
 * @param {string} grokHome
 * @returns {object}
 */
export function loadRegistry(grokHome) {
  const path = registryPath(grokHome);

  if (!existsSync(path)) {
    return defaultRegistry();
  }

  try {
    const data = JSON.parse(readFileSync(path, "utf-8"));
    if (data.schema_version !== SCHEMA_VERSION) {
      // Future migration logic
      data.schema_version = SCHEMA_VERSION;
    }
    return data;
  } catch {
    return defaultRegistry();
  }
}

/**
 * Save the registry.
 * @param {string} grokHome
 * @param {object} registry
 */
export function saveRegistry(grokHome, registry) {
  const path = registryPath(grokHome);
  const dir = dirname(path);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  writeFileSync(path, JSON.stringify(registry, null, 2) + "\n", {
    encoding: "utf-8",
    mode: 0o600,
  });
}

/**
 * Default empty registry.
 */
function defaultRegistry() {
  return {
    schema_version: SCHEMA_VERSION,
    active_account_key: null,
    previous_account_key: null,
    accounts: [],
  };
}

/**
 * Sync registry from the current auth.json.
 * Detects accounts in auth.json that aren't in the registry and adds them.
 *
 * @param {string} grokHome
 * @returns {object} Updated registry
 */
export function syncRegistryFromAuth(grokHome) {
  const registry = loadRegistry(grokHome);
  const { entries } = readAuthJson(grokHome);

  for (const [grokKey, entry] of entries) {
    // Generate unique account key
    const key = entry.user_id || entry.email || grokKey;

    // Always backup auth data using the unique account key
    const cleanEntry = { ...entry };
    delete cleanEntry._key;
    backupAccountAuth(grokHome, key, cleanEntry);

    const existing = registry.accounts.find((a) => a.key === key);
    if (!existing) {
      registry.accounts.push({
        key,
        email: displayEmail(entry),
        name: displayName(entry),
        user_id: entry.user_id || null,
        team_id: entry.team_id || null,
        auth_mode: entry.auth_mode || "oidc",
        alias: "",
        created_at: entry.create_time
          ? new Date(entry.create_time).getTime()
          : Date.now(),
        last_used_at: null,
      });
    } else {
      // Update metadata from auth
      existing.email = displayEmail(entry);
      existing.name = displayName(entry);
      if (entry.user_id) existing.user_id = entry.user_id;
      if (entry.team_id) existing.team_id = entry.team_id;
    }
  }

  // Detect active account
  if (entries.size > 0) {
    const firstEntry = entries.values().next().value;
    const firstKey = entries.keys().next().value;
    const activeKey = firstEntry.user_id || firstEntry.email || firstKey;
    registry.active_account_key = activeKey;
  }

  saveRegistry(grokHome, registry);
  return registry;
}

/**
 * Store an individual account's auth data as a backup.
 * @param {string} grokHome
 * @param {string} accountKey
 * @param {object} authEntry
 */
export function backupAccountAuth(grokHome, accountKey, authEntry) {
  const dir = accountsDir(grokHome);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  const path = accountBackupPath(grokHome, accountKey);
  const data = { [accountKey]: authEntry };
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", {
    encoding: "utf-8",
    mode: 0o600,
  });
}

/**
 * Restore an account's auth data from backup.
 * @param {string} grokHome
 * @param {string} accountKey
 * @returns {object|null}
 */
export function restoreAccountAuth(grokHome, accountKey) {
  const path = accountBackupPath(grokHome, accountKey);
  if (!existsSync(path)) return null;

  try {
    const data = JSON.parse(readFileSync(path, "utf-8"));
    return data[accountKey] || Object.values(data)[0] || null;
  } catch {
    return null;
  }
}

/**
 * Switch to a specific account.
 * - Backup all current auth entries
 * - Write only the target account to auth.json
 * - Update the registry
 *
 * @param {string} grokHome
 * @param {string} targetKey - The account key to switch to
 * @returns {{ success: boolean, message: string }}
 */
export function switchAccount(grokHome, targetKey) {
  const registry = loadRegistry(grokHome);
  const { entries } = readAuthJson(grokHome);

  // Backup all current entries
  for (const [grokKey, entry] of entries) {
    const key = entry.user_id || entry.email || grokKey;
    const cleanEntry = { ...entry };
    delete cleanEntry._key;
    backupAccountAuth(grokHome, key, cleanEntry);
  }

  // Find the target account's auth data
  let targetAuth = null;
  let targetGrokKey = null;

  for (const [grokKey, entry] of entries) {
    const key = entry.user_id || entry.email || grokKey;
    if (key === targetKey) {
      targetAuth = { ...entry };
      delete targetAuth._key;
      targetGrokKey = grokKey;
      break;
    }
  }

  if (!targetAuth) {
    // Try to restore from backup
    targetAuth = restoreAccountAuth(grokHome, targetKey);
    if (targetAuth) {
      targetGrokKey = targetAuth.oidc_issuer && targetAuth.oidc_client_id
        ? `${targetAuth.oidc_issuer}::${targetAuth.oidc_client_id}`
        : `https://auth.x.ai::b1a00492-073a-47ea-816f-4c329264a828`;
    }
  }

  if (!targetAuth) {
    return {
      success: false,
      message: `Account '${targetKey}' not found in auth data or backups.`,
    };
  }

  // Write only the target account to auth.json
  writeAuthJson(grokHome, { [targetGrokKey]: targetAuth });

  // Update registry
  const prevKey = registry.active_account_key;
  registry.previous_account_key = prevKey;
  registry.active_account_key = targetKey;

  const account = registry.accounts.find((a) => a.key === targetKey);
  if (account) {
    account.last_used_at = Date.now();
  }

  saveRegistry(grokHome, registry);

  return {
    success: true,
    message: `Switched to ${account ? account.email : targetKey}`,
  };
}

/**
 * Register a new account from the current auth.json.
 * Called after `grok login` has updated auth.json with new credentials.
 *
 * @param {string} grokHome
 * @returns {{ added: number, accounts: object[] }}
 */
export function registerFromCurrentAuth(grokHome) {
  const registry = syncRegistryFromAuth(grokHome);
  const { entries } = readAuthJson(grokHome);

  // Backup all current entries
  for (const [grokKey, entry] of entries) {
    const key = entry.user_id || entry.email || grokKey;
    const cleanEntry = { ...entry };
    delete cleanEntry._key;
    backupAccountAuth(grokHome, key, cleanEntry);
  }

  saveRegistry(grokHome, registry);

  return {
    added: entries.size,
    accounts: registry.accounts,
  };
}

/**
 * Remove an account from the registry and its backup.
 * @param {string} grokHome
 * @param {string} accountKey
 * @returns {{ success: boolean, message: string }}
 */
export function removeAccount(grokHome, accountKey) {
  const registry = loadRegistry(grokHome);
  const idx = registry.accounts.findIndex((a) => a.key === accountKey);

  if (idx === -1) {
    return { success: false, message: `Account not found: ${accountKey}` };
  }

  const removed = registry.accounts.splice(idx, 1)[0];

  // If we removed the active account, switch to another
  if (registry.active_account_key === accountKey) {
    registry.active_account_key =
      registry.accounts.length > 0 ? registry.accounts[0].key : null;

    // Update auth.json if we have a new active
    if (registry.active_account_key) {
      const newActive = restoreAccountAuth(
        grokHome,
        registry.active_account_key
      );
      if (newActive) {
        writeAuthJson(grokHome, {
          [registry.active_account_key]: newActive,
        });
      }
    }
  }

  // Remove backup file
  const backupPath = accountBackupPath(grokHome, accountKey);
  try {
    unlinkSync(backupPath);
  } catch {
    // Ignore if backup doesn't exist
  }

  saveRegistry(grokHome, registry);

  return {
    success: true,
    message: `Removed account: ${removed.email}`,
  };
}

/**
 * Get all accounts with their active status.
 * @param {string} grokHome
 * @returns {object[]}
 */
export function listAccounts(grokHome) {
  const registry = syncRegistryFromAuth(grokHome);
  return registry.accounts.map((account, index) => ({
    ...account,
    index: index + 1,
    active: account.key === registry.active_account_key,
    previous: account.key === registry.previous_account_key,
  }));
}

/**
 * Find an account by query (number, email substring, alias, or user_id).
 * @param {string} grokHome
 * @param {string} query
 * @returns {object|null}
 */
export function findAccount(grokHome, query) {
  const accounts = listAccounts(grokHome);

  // Try as number (1-indexed)
  const num = parseInt(query, 10);
  if (!isNaN(num) && num >= 1 && num <= accounts.length) {
    return accounts[num - 1];
  }

  // Try special keywords
  if (query === "-" || query === "prev" || query === "previous") {
    const registry = loadRegistry(grokHome);
    if (registry.previous_account_key) {
      return accounts.find((a) => a.key === registry.previous_account_key) || null;
    }
    return null;
  }

  // Try email match (case insensitive)
  const lowerQuery = query.toLowerCase();
  const emailMatch = accounts.find(
    (a) => a.email && a.email.toLowerCase().includes(lowerQuery)
  );
  if (emailMatch) return emailMatch;

  // Try alias match
  const aliasMatch = accounts.find(
    (a) => a.alias && a.alias.toLowerCase() === lowerQuery
  );
  if (aliasMatch) return aliasMatch;

  // Try user_id match
  const idMatch = accounts.find(
    (a) => a.user_id && a.user_id.startsWith(query)
  );
  if (idMatch) return idMatch;

  return null;
}

/**
 * Export all accounts to a portable JSON file.
 * @param {string} grokHome
 * @param {string} outputPath
 */
export function exportAccounts(grokHome, outputPath) {
  const registry = loadRegistry(grokHome);
  const exportData = {
    exported_at: new Date().toISOString(),
    exported_by: "grok-auth",
    active_account_key: registry.active_account_key,
    accounts: {},
  };

  for (const account of registry.accounts) {
    const authData = restoreAccountAuth(grokHome, account.key);
    exportData.accounts[account.key] = {
      metadata: account,
      auth: authData,
    };
  }

  writeFileSync(outputPath, JSON.stringify(exportData, null, 2) + "\n", {
    encoding: "utf-8",
    mode: 0o600,
  });
}

/**
 * Import accounts from a portable JSON file.
 * @param {string} grokHome
 * @param {string} inputPath
 * @returns {{ imported: number }}
 */
export function importAccounts(grokHome, inputPath) {
  const data = JSON.parse(readFileSync(inputPath, "utf-8"));
  const registry = loadRegistry(grokHome);
  let imported = 0;

  for (const [key, value] of Object.entries(data.accounts || {})) {
    const { metadata, auth } = value;

    // Skip if already exists
    if (registry.accounts.find((a) => a.key === key)) continue;

    registry.accounts.push({
      key,
      email: metadata?.email || "(unknown)",
      name: metadata?.name || "Unknown",
      user_id: metadata?.user_id || null,
      team_id: metadata?.team_id || null,
      auth_mode: metadata?.auth_mode || "oidc",
      alias: metadata?.alias || "",
      created_at: metadata?.created_at || Date.now(),
      last_used_at: metadata?.last_used_at || null,
    });

    if (auth) {
      backupAccountAuth(grokHome, key, auth);
    }

    imported++;
  }

  saveRegistry(grokHome, registry);
  return { imported };
}
