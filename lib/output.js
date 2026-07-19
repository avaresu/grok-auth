/**
 * Terminal output utilities — colored, formatted output for the CLI.
 * Zero dependencies, uses ANSI escape codes directly.
 */

const supportsColor =
  process.env.FORCE_COLOR !== "0" &&
  (process.env.FORCE_COLOR ||
    process.stdout.isTTY);

const c = {
  reset: supportsColor ? "\x1b[0m" : "",
  bold: supportsColor ? "\x1b[1m" : "",
  dim: supportsColor ? "\x1b[2m" : "",
  italic: supportsColor ? "\x1b[3m" : "",
  underline: supportsColor ? "\x1b[4m" : "",

  // Colors
  red: supportsColor ? "\x1b[31m" : "",
  green: supportsColor ? "\x1b[32m" : "",
  yellow: supportsColor ? "\x1b[33m" : "",
  blue: supportsColor ? "\x1b[34m" : "",
  magenta: supportsColor ? "\x1b[35m" : "",
  cyan: supportsColor ? "\x1b[36m" : "",
  white: supportsColor ? "\x1b[37m" : "",
  gray: supportsColor ? "\x1b[90m" : "",

  // Bright
  brightGreen: supportsColor ? "\x1b[92m" : "",
  brightYellow: supportsColor ? "\x1b[93m" : "",
  brightCyan: supportsColor ? "\x1b[96m" : "",
  brightWhite: supportsColor ? "\x1b[97m" : "",

  // Background
  bgGreen: supportsColor ? "\x1b[42m" : "",
  bgYellow: supportsColor ? "\x1b[43m" : "",
  bgBlue: supportsColor ? "\x1b[44m" : "",
};

export { c };

/**
 * Print a padded table to stdout.
 * @param {string[][]} rows - 2D array of strings
 * @param {{ header?: boolean, indent?: number }} opts
 */
export function printTable(rows, opts = {}) {
  if (rows.length === 0) return;

  const indent = " ".repeat(opts.indent || 2);

  // Calculate column widths
  const colWidths = [];
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      const len = stripAnsi(row[i]).length;
      colWidths[i] = Math.max(colWidths[i] || 0, len);
    }
  }

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const parts = row.map((cell, i) => {
      const stripped = stripAnsi(cell);
      const pad = colWidths[i] - stripped.length;
      return cell + " ".repeat(Math.max(0, pad));
    });
    console.log(indent + parts.join("  "));

    // Header separator
    if (r === 0 && opts.header) {
      const sep = colWidths.map((w) => "─".repeat(w)).join("──");
      console.log(indent + c.dim + sep + c.reset);
    }
  }
}

/**
 * Strip ANSI escape codes from a string.
 */
function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * Format a timestamp as relative time.
 * @param {number} ms - Unix timestamp in milliseconds
 * @returns {string}
 */
export function relativeTime(ms) {
  if (!ms) return "never";
  const diff = Date.now() - ms;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return new Date(ms).toLocaleDateString();
}

/**
 * Print a success message.
 */
export function success(msg) {
  console.log(`${c.green}✔${c.reset} ${msg}`);
}

/**
 * Print an error message.
 */
export function error(msg) {
  console.error(`${c.red}✖${c.reset} ${msg}`);
}

/**
 * Print a warning message.
 */
export function warn(msg) {
  console.log(`${c.yellow}⚠${c.reset} ${msg}`);
}

/**
 * Print an info message.
 */
export function info(msg) {
  console.log(`${c.cyan}ℹ${c.reset} ${msg}`);
}

/**
 * Print grok-auth header banner.
 */
export function printBanner() {
  console.log(
    `\n${c.bold}${c.brightCyan}grok-auth${c.reset} ${c.dim}— Multi-account manager for Grok Build CLI${c.reset}\n`
  );
}
