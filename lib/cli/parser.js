/**
 * CLI argument parser — minimal, zero-dependency arg parser.
 */

const COMMANDS = [
  "list",
  "switch",
  "login",
  "remove",
  "import",
  "export",
  "alias",
  "version",
  "help",
];

/**
 * Parse CLI arguments.
 * @param {string[]} argv
 * @returns {{ command: string, args: string[], flags: object }}
 */
export function parseArgs(argv) {
  const flags = {};
  const positional = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      flags.help = true;
    } else if (arg === "--json") {
      flags.json = true;
    } else if (arg === "--live") {
      flags.live = true;
    } else if (arg === "--all") {
      flags.all = true;
    } else if (arg === "--force" || arg === "-f") {
      flags.force = true;
    } else if (arg === "--device-auth" || arg === "--device-code") {
      flags.deviceAuth = true;
    } else if (arg === "--oauth") {
      flags.oauth = true;
    } else if (arg === "--version" || arg === "-v") {
      return { command: "version", args: [], flags };
    } else if (arg.startsWith("--")) {
      // Generic flag
      const key = arg.slice(2).replace(/-/g, "_");
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else if (arg.startsWith("-") && arg.length > 1) {
      // Short flags
      for (const ch of arg.slice(1)) {
        flags[ch] = true;
      }
    } else {
      positional.push(arg);
    }
  }

  // First positional is the command
  let command = positional.shift() || "help";

  // Normalize command aliases
  if (command === "ls") command = "list";
  if (command === "sw") command = "switch";
  if (command === "rm") command = "remove";
  if (command === "del" || command === "delete") command = "remove";
  if (command === "log" || command === "signin" || command === "sign-in")
    command = "login";
  if (command === "exp") command = "export";
  if (command === "imp") command = "import";
  if (command === "v" || command === "--version") command = "version";
  if (command === "h" || command === "--help") command = "help";

  if (flags.help && command === "help") {
    // already help
  } else if (flags.help) {
    // Show help for the command
    positional.unshift(command);
    command = "help";
  }

  if (!COMMANDS.includes(command)) {
    // Maybe it's a switch shortcut: `grok-auth 2`
    const num = parseInt(command, 10);
    if (!isNaN(num) && num > 0) {
      positional.unshift(command);
      command = "switch";
    } else {
      // Treat unknown as switch query: `grok-auth user@email.com`
      positional.unshift(command);
      command = "switch";
    }
  }

  return { command, args: positional, flags };
}
