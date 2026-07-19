/**
 * Command dispatcher — routes CLI commands to their handlers.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { resolveGrokHome } from "../config.js";
import {
  listAccounts,
  findAccount,
  switchAccount,
  registerFromCurrentAuth,
  removeAccount,
  exportAccounts,
  importAccounts,
  syncRegistryFromAuth,
  loadRegistry,
  saveRegistry,
  backupAccountAuth,
} from "../registry.js";
import { readAuthJson, isExpired, authModeLabel } from "../auth.js";
import {
  c,
  printTable,
  relativeTime,
  success,
  error,
  warn,
  info,
  printBanner,
} from "../output.js";
import { pick, confirm } from "./picker.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getVersion() {
  try {
    const pkg = JSON.parse(
      readFileSync(join(__dirname, "..", "..", "package.json"), "utf-8")
    );
    return pkg.version;
  } catch {
    return "unknown";
  }
}

/**
 * Run a command.
 * @param {string} command
 * @param {string[]} args
 * @param {object} flags
 */
export async function runCommand(command, args, flags) {
  switch (command) {
    case "list":
      return cmdList(flags);
    case "switch":
      return cmdSwitch(args, flags);
    case "login":
      return cmdLogin(flags);
    case "remove":
      return cmdRemove(args, flags);
    case "export":
      return cmdExport(args, flags);
    case "import":
      return cmdImport(args, flags);
    case "alias":
      return cmdAlias(args, flags);
    case "version":
      return cmdVersion();
    case "help":
      return cmdHelp(args);
    default:
      return cmdHelp([]);
  }
}

// ─────────────────────────────────────────────
// LIST
// ─────────────────────────────────────────────
function cmdList(flags) {
  const grokHome = resolveGrokHome();
  const accounts = listAccounts(grokHome);

  if (accounts.length === 0) {
    printBanner();
    warn("No accounts found. Run `grok-auth login` to add one.");
    return;
  }

  if (flags.json) {
    console.log(JSON.stringify(accounts, null, 2));
    return;
  }

  printBanner();

  const header = [
    `${c.bold}#${c.reset}`,
    `${c.bold}Email${c.reset}`,
    `${c.bold}Name${c.reset}`,
    `${c.bold}Auth${c.reset}`,
    `${c.bold}Team ID${c.reset}`,
    `${c.bold}Status${c.reset}`,
    `${c.bold}Last Used${c.reset}`,
  ];

  const rows = [header];

  for (const account of accounts) {
    const activeMarker = account.active
      ? `${c.green}▸${c.reset} ${c.brightGreen}${account.index}${c.reset}`
      : `  ${c.dim}${account.index}${c.reset}`;

    const email = account.active
      ? `${c.brightGreen}${account.email}${c.reset}`
      : account.email;

    const name = account.alias || account.name || "";

    const authMode = authModeLabel(account);

    const teamId = account.team_id
      ? `${c.dim}${account.team_id.slice(0, 8)}…${c.reset}`
      : `${c.dim}—${c.reset}`;

    // Check token expiry from live auth data
    const { entries } = readAuthJson(grokHome);
    const liveEntry = entries.get(account.key);
    let status;
    if (account.active) {
      if (liveEntry && isExpired(liveEntry)) {
        status = `${c.yellow}expired${c.reset}`;
      } else {
        status = `${c.green}active${c.reset}`;
      }
    } else {
      status = `${c.dim}stored${c.reset}`;
    }

    const lastUsed = relativeTime(account.last_used_at);

    rows.push([
      activeMarker,
      email,
      name,
      authMode,
      teamId,
      status,
      `${c.dim}${lastUsed}${c.reset}`,
    ]);
  }

  printTable(rows, { header: true });
  console.log();
  info(
    `${accounts.length} account${accounts.length > 1 ? "s" : ""} registered. Use ${c.bold}grok-auth switch${c.reset} to change.`
  );
  console.log();
}

// ─────────────────────────────────────────────
// SWITCH
// ─────────────────────────────────────────────
async function cmdSwitch(args, flags) {
  const grokHome = resolveGrokHome();
  const accounts = listAccounts(grokHome);

  if (accounts.length === 0) {
    error("No accounts found. Run `grok-auth login` to add one.");
    const err = new Error("No accounts");
    err.code = "HANDLED";
    throw err;
  }

  let target;

  if (args.length > 0) {
    // Direct switch by query
    const query = args[0];

    // Special: switch to previous
    if (query === "-" || query === "prev" || query === "previous") {
      const registry = loadRegistry(grokHome);
      if (!registry.previous_account_key) {
        error("No previous account to switch to.");
        const err = new Error("No previous");
        err.code = "HANDLED";
        throw err;
      }
      target = accounts.find(
        (a) => a.key === registry.previous_account_key
      );
      if (!target) {
        error("Previous account not found in registry.");
        const err = new Error("Previous not found");
        err.code = "HANDLED";
        throw err;
      }
    } else {
      target = findAccount(grokHome, query);
      if (!target) {
        error(`No account matching '${query}'.`);
        const err = new Error("Not found");
        err.code = "HANDLED";
        throw err;
      }
    }
  } else {
    // Interactive picker
    const activeIdx = accounts.findIndex((a) => a.active);
    const displayItems = accounts.map((a) => {
      const marker = a.active ? `${c.green}(active)${c.reset} ` : "";
      return `${marker}${a.email} ${c.dim}— ${a.name || ""}${c.reset}`;
    });

    const selected = await pick(displayItems, {
      prompt: "Switch to which account?",
      activeIndex: activeIdx,
    });

    if (selected === -1) {
      info("Cancelled.");
      return;
    }

    target = accounts[selected];
  }

  if (target.active) {
    info(`Already on ${c.bold}${target.email}${c.reset}.`);
    return;
  }

  const result = switchAccount(grokHome, target.key);

  if (result.success) {
    success(result.message);
    warn(
      `Restart your Grok CLI session for the change to take effect.`
    );
  } else {
    error(result.message);
  }
}

// ─────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────
function cmdLogin(flags) {
  const grokHome = resolveGrokHome();

  // Snapshot current auth.json entries before login and back them up
  const beforeAuth = readAuthJson(grokHome);
  const beforeKeys = new Set();
  for (const [grokKey, entry] of beforeAuth.entries) {
    const key = entry.user_id || entry.email || grokKey;
    beforeKeys.add(key);

    const cleanEntry = { ...entry };
    delete cleanEntry._key;
    backupAccountAuth(grokHome, key, cleanEntry);
  }

  info("Running grok login...\n");

  // Build grok login command
  const loginArgs = ["login"];
  if (flags.deviceAuth) loginArgs.push("--device-auth");
  if (flags.oauth) loginArgs.push("--oauth");

  // Run grok login
  const result = spawnSync("grok", loginArgs, {
    stdio: "inherit",
    shell: true,
  });

  if (result.status !== 0) {
    error("grok login failed. Please try again.");
    const err = new Error("Login failed");
    err.code = "HANDLED";
    throw err;
  }

  console.log();

  // Register the new account
  const { accounts } = registerFromCurrentAuth(grokHome);

  // Find newly added accounts by checking against our unique keys
  const afterAuth = readAuthJson(grokHome);
  const newKeys = [];
  for (const [grokKey, entry] of afterAuth.entries) {
    const key = entry.user_id || entry.email || grokKey;
    if (!beforeKeys.has(key)) {
      newKeys.push(key);
    }
  }

  if (newKeys.length > 0) {
    for (const key of newKeys) {
      const account = accounts.find((a) => a.key === key);
      success(
        `New account registered: ${c.bold}${account?.email || key}${c.reset}`
      );
    }
  } else {
    // Existing account token refreshed
    success("Account credentials updated.");
  }

  info(`Total: ${accounts.length} account(s) registered.`);
}

// ─────────────────────────────────────────────
// REMOVE
// ─────────────────────────────────────────────
async function cmdRemove(args, flags) {
  const grokHome = resolveGrokHome();
  const accounts = listAccounts(grokHome);

  if (accounts.length === 0) {
    error("No accounts to remove.");
    const err = new Error("No accounts");
    err.code = "HANDLED";
    throw err;
  }

  if (flags.all) {
    const yes = await confirm(
      `Remove ALL ${accounts.length} accounts?`,
      false
    );
    if (!yes) {
      info("Cancelled.");
      return;
    }

    for (const a of accounts) {
      removeAccount(grokHome, a.key);
    }
    success(`Removed all ${accounts.length} accounts.`);
    return;
  }

  let target;

  if (args.length > 0) {
    target = findAccount(grokHome, args[0]);
    if (!target) {
      error(`No account matching '${args[0]}'.`);
      const err = new Error("Not found");
      err.code = "HANDLED";
      throw err;
    }
  } else {
    // Interactive
    const displayItems = accounts.map((a) => {
      const marker = a.active ? `${c.green}(active)${c.reset} ` : "";
      return `${marker}${a.email} ${c.dim}— ${a.name || ""}${c.reset}`;
    });

    const selected = await pick(displayItems, {
      prompt: "Remove which account?",
    });

    if (selected === -1) {
      info("Cancelled.");
      return;
    }

    target = accounts[selected];
  }

  if (!flags.force) {
    const yes = await confirm(`Remove ${target.email}?`, false);
    if (!yes) {
      info("Cancelled.");
      return;
    }
  }

  const result = removeAccount(grokHome, target.key);
  if (result.success) {
    success(result.message);
  } else {
    error(result.message);
  }
}

// ─────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────
function cmdExport(args, flags) {
  const grokHome = resolveGrokHome();
  const outputPath = args[0] || "grok-auth-export.json";

  exportAccounts(grokHome, outputPath);
  success(`Exported accounts to ${c.bold}${outputPath}${c.reset}`);
}

// ─────────────────────────────────────────────
// IMPORT
// ─────────────────────────────────────────────
function cmdImport(args, flags) {
  if (args.length === 0) {
    error("Usage: grok-auth import <file>");
    const err = new Error("Missing file");
    err.code = "HANDLED";
    throw err;
  }

  const grokHome = resolveGrokHome();
  const inputPath = args[0];

  const result = importAccounts(grokHome, inputPath);
  success(
    `Imported ${result.imported} account(s) from ${c.bold}${inputPath}${c.reset}`
  );
}

// ─────────────────────────────────────────────
// ALIAS
// ─────────────────────────────────────────────
async function cmdAlias(args, flags) {
  const grokHome = resolveGrokHome();

  if (args.length < 2) {
    error("Usage: grok-auth alias <query> <alias_name>");
    info("Example: grok-auth alias 1 work");
    const err = new Error("Missing args");
    err.code = "HANDLED";
    throw err;
  }

  const [query, aliasName] = args;
  const target = findAccount(grokHome, query);

  if (!target) {
    error(`No account matching '${query}'.`);
    const err = new Error("Not found");
    err.code = "HANDLED";
    throw err;
  }

  const registry = loadRegistry(grokHome);
  const account = registry.accounts.find((a) => a.key === target.key);
  if (account) {
    account.alias = aliasName;
    saveRegistry(grokHome, registry);
    success(
      `Set alias '${c.bold}${aliasName}${c.reset}' for ${account.email}`
    );
  }
}

// ─────────────────────────────────────────────
// VERSION
// ─────────────────────────────────────────────
function cmdVersion() {
  console.log(`grok-auth v${getVersion()}`);
}

// ─────────────────────────────────────────────
// HELP
// ─────────────────────────────────────────────
function cmdHelp(args) {
  printBanner();

  const cmd = args[0];

  if (cmd) {
    printCommandHelp(cmd);
    return;
  }

  console.log(`${c.bold}USAGE${c.reset}`);
  console.log(`  grok-auth <command> [options]\n`);

  console.log(`${c.bold}COMMANDS${c.reset}`);
  const cmds = [
    ["list", "List all stored accounts"],
    ["switch [query]", "Switch the active account"],
    ["login", "Run grok login and register the account"],
    ["remove [query]", "Remove an account"],
    ["alias <query> <name>", "Set a friendly alias for an account"],
    ["import <file>", "Import accounts from a file"],
    ["export [file]", "Export accounts to a file"],
    ["version", "Show version"],
    ["help [command]", "Show help"],
  ];

  for (const [cmd, desc] of cmds) {
    console.log(
      `  ${c.cyan}${cmd.padEnd(24)}${c.reset}${desc}`
    );
  }

  console.log(`\n${c.bold}SHORTCUTS${c.reset}`);
  console.log(
    `  ${c.cyan}grok-auth 2${c.reset}              Switch to account #2`
  );
  console.log(
    `  ${c.cyan}grok-auth -${c.reset}              Switch to previous account`
  );
  console.log(
    `  ${c.cyan}grok-auth user@mail${c.reset}      Switch by email match`
  );

  console.log(`\n${c.bold}ALIASES${c.reset}`);
  console.log(
    `  ${c.dim}ls → list, sw → switch, rm → remove, log → login${c.reset}`
  );

  console.log(`\n${c.bold}ENVIRONMENT${c.reset}`);
  console.log(
    `  ${c.cyan}GROK_HOME${c.reset}               Override grok config directory`
  );
  console.log(
    `  ${c.cyan}GROK_AUTH_DEBUG${c.reset}          Enable debug output`
  );
  console.log();
}

function printCommandHelp(cmd) {
  const helpMap = {
    list: `${c.bold}grok-auth list${c.reset}

  List all stored accounts.

  ${c.bold}Options:${c.reset}
    --json    Output as JSON

  ${c.bold}Examples:${c.reset}
    grok-auth list
    grok-auth list --json
    grok-auth ls`,

    switch: `${c.bold}grok-auth switch [query]${c.reset}

  Switch the active Grok account.
  Without a query, shows an interactive picker.

  ${c.bold}Query types:${c.reset}
    <number>    Row number from 'list'
    <email>     Partial email match
    <alias>     Account alias
    -           Switch to previous account

  ${c.bold}Examples:${c.reset}
    grok-auth switch
    grok-auth switch 2
    grok-auth switch user@example.com
    grok-auth switch -
    grok-auth sw work`,

    login: `${c.bold}grok-auth login${c.reset}

  Run 'grok login' and register the new account.

  ${c.bold}Options:${c.reset}
    --device-auth    Use device code flow (for headless/SSH)
    --oauth          Use OAuth via auth.x.ai

  ${c.bold}Examples:${c.reset}
    grok-auth login
    grok-auth login --device-auth`,

    remove: `${c.bold}grok-auth remove [query]${c.reset}

  Remove an account from the registry.

  ${c.bold}Options:${c.reset}
    --all       Remove all accounts
    --force     Skip confirmation

  ${c.bold}Examples:${c.reset}
    grok-auth remove
    grok-auth remove 2
    grok-auth remove user@example.com
    grok-auth remove --all`,
  };

  console.log(helpMap[cmd] || `No help available for '${cmd}'.`);
  console.log();
}
