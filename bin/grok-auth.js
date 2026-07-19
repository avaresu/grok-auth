#!/usr/bin/env node

/**
 * grok-auth — CLI for switching and managing multiple Grok Build CLI accounts.
 *
 * Usage:
 *   grok-auth list              List all stored accounts
 *   grok-auth switch             Switch account interactively
 *   grok-auth switch <query>     Switch by number or email
 *   grok-auth login              Run grok login and register the new account
 *   grok-auth remove             Remove accounts interactively
 *   grok-auth remove <query>     Remove account by number or email
 *   grok-auth import <file>      Import accounts from file
 *   grok-auth export <file>      Export accounts to file
 *   grok-auth version            Show version
 *   grok-auth help               Show help
 */

import { parseArgs } from "../lib/cli/parser.js";
import { runCommand } from "../lib/cli/commands.js";

async function main() {
  try {
    const { command, args, flags } = parseArgs(process.argv.slice(2));
    await runCommand(command, args, flags);
  } catch (err) {
    if (err.code === "HANDLED") {
      process.exit(1);
    }
    console.error(`\x1b[31m✖ Error:\x1b[0m ${err.message}`);
    if (process.env.GROK_AUTH_DEBUG) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

main();
