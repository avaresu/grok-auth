/**
 * Config resolver — finds the grok home directory on any platform.
 *
 * Resolution order:
 *   1. $GROK_HOME (env override)
 *   2. $HOME/.grok   (Linux / macOS)
 *   3. %USERPROFILE%\.grok  (Windows)
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/** Default grok config directory name */
const GROK_DIR_NAME = ".grok";

/** Env var that can override the grok home path */
const GROK_HOME_ENV = "GROK_HOME";

/**
 * Resolve the grok home directory.
 * @returns {string} Absolute path to ~/.grok (or override)
 * @throws If no valid home can be determined
 */
export function resolveGrokHome() {
  // 1. Env override
  const override = process.env[GROK_HOME_ENV];
  if (override && override.length > 0) {
    if (!existsSync(override)) {
      throw new Error(
        `GROK_HOME points to '${override}', but that path does not exist.`
      );
    }
    return override;
  }

  // 2. Standard home
  const home =
    process.env.HOME || process.env.USERPROFILE || homedir();
  if (!home) {
    throw new Error(
      "Cannot determine home directory. Set GROK_HOME environment variable."
    );
  }

  return join(home, GROK_DIR_NAME);
}

/**
 * Path to the main grok auth.json file.
 */
export function authJsonPath(grokHome) {
  return join(grokHome || resolveGrokHome(), "auth.json");
}

/**
 * Path to the grok-auth accounts directory.
 */
export function accountsDir(grokHome) {
  return join(grokHome || resolveGrokHome(), "accounts");
}

/**
 * Path to the grok-auth registry file.
 */
export function registryPath(grokHome) {
  return join(accountsDir(grokHome), "grok-auth-registry.json");
}

/**
 * Path to an individual account backup.
 */
export function accountBackupPath(grokHome, accountKey) {
  const safeKey = accountKey.replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(accountsDir(grokHome), `${safeKey}.auth.json`);
}
