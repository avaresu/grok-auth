/**
 * Auth parser — read, parse, and write grok auth.json files.
 *
 * Grok auth.json format:
 * {
 *   "<issuer>::<client_id>": {
 *     "key": "<JWT access token>",
 *     "auth_mode": "oidc",
 *     "user_id": "...",
 *     "email": "...",
 *     "first_name": "...",
 *     "last_name": "...",
 *     "team_id": "...",
 *     "refresh_token": "...",
 *     "expires_at": "...",
 *     "oidc_issuer": "...",
 *     "oidc_client_id": "...",
 *     ...
 *   }
 * }
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { authJsonPath } from "./config.js";

/**
 * Read and parse the grok auth.json file.
 * Returns a Map of account entries keyed by their composite key.
 *
 * @param {string} [grokHome]
 * @returns {{ entries: Map<string, object>, raw: object }}
 */
export function readAuthJson(grokHome) {
  const path = authJsonPath(grokHome);

  if (!existsSync(path)) {
    return { entries: new Map(), raw: {} };
  }

  const data = JSON.parse(readFileSync(path, "utf-8"));
  const entries = new Map();

  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "object" && value !== null) {
      entries.set(key, {
        ...value,
        _key: key,
      });
    }
  }

  return { entries, raw: data };
}

/**
 * Write auth.json with the given entries.
 * Creates a backup of the current file before overwriting.
 *
 * @param {string} grokHome
 * @param {object} data - The raw auth.json object to write
 */
export function writeAuthJson(grokHome, data) {
  const path = authJsonPath(grokHome);

  // Backup existing
  if (existsSync(path)) {
    const backupPath = path + ".bak";
    copyFileSync(path, backupPath);
  }

  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", {
    encoding: "utf-8",
    mode: 0o600,
  });
}

/**
 * Parse a JWT token to extract claims (without verification).
 * @param {string} token
 * @returns {object|null}
 */
export function parseJwtClaims(token) {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = Buffer.from(parts[1], "base64url").toString("utf-8");
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

/**
 * Extract a human-readable display name from an auth entry.
 * @param {object} entry
 * @returns {string}
 */
export function displayName(entry) {
  if (entry.first_name || entry.last_name) {
    return [entry.first_name, entry.last_name].filter(Boolean).join(" ");
  }
  return entry.email || entry.user_id || "Unknown";
}

/**
 * Extract email from an auth entry.
 * @param {object} entry
 * @returns {string}
 */
export function displayEmail(entry) {
  return entry.email || "(no email)";
}

/**
 * Check if a token is expired.
 * @param {object} entry
 * @returns {boolean}
 */
export function isExpired(entry) {
  if (!entry.expires_at) return false;
  try {
    const expiresAt = new Date(entry.expires_at);
    return expiresAt < new Date();
  } catch {
    return false;
  }
}

/**
 * Get the auth mode label.
 * @param {object} entry
 * @returns {string}
 */
export function authModeLabel(entry) {
  switch (entry.auth_mode) {
    case "oidc":
      return "OAuth";
    case "apikey":
      return "API Key";
    default:
      return entry.auth_mode || "Unknown";
  }
}

/**
 * Build a composite key for an account entry.
 * @param {object} entry
 * @returns {string}
 */
export function buildAccountKey(entry) {
  const issuer = entry.oidc_issuer || "https://auth.x.ai";
  const clientId = entry.oidc_client_id || "unknown";
  return `${issuer}::${clientId}`;
}
