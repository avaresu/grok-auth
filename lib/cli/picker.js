/**
 * Interactive picker — simple stdin-based menu for terminal.
 * Works cross-platform (Windows + Linux).
 */

import { createInterface } from "node:readline";
import { c } from "../output.js";

/**
 * Show an interactive picker and return the selected index.
 * @param {string[]} items - Display strings for each option
 * @param {{ prompt?: string, activeIndex?: number }} opts
 * @returns {Promise<number>} Selected index (0-based), or -1 if cancelled
 */
export async function pick(items, opts = {}) {
  const { prompt = "Select an account", activeIndex = -1 } = opts;

  console.log(`${c.bold}${prompt}${c.reset}\n`);

  for (let i = 0; i < items.length; i++) {
    const marker =
      i === activeIndex
        ? `${c.green}▸${c.reset}`
        : ` `;
    const num = `${c.dim}${String(i + 1).padStart(2)}.${c.reset}`;
    console.log(`  ${marker} ${num} ${items[i]}`);
  }

  console.log();

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(
      `${c.cyan}?${c.reset} Enter number (1-${items.length}) or 'q' to cancel: `,
      (answer) => {
        rl.close();
        const trimmed = answer.trim();

        if (trimmed === "q" || trimmed === "Q" || trimmed === "") {
          resolve(-1);
          return;
        }

        const num = parseInt(trimmed, 10);
        if (isNaN(num) || num < 1 || num > items.length) {
          resolve(-1);
          return;
        }

        resolve(num - 1);
      }
    );
  });
}

/**
 * Ask a yes/no confirmation question.
 * @param {string} question
 * @param {boolean} defaultYes
 * @returns {Promise<boolean>}
 */
export async function confirm(question, defaultYes = false) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const hint = defaultYes ? "[Y/n]" : "[y/N]";

  return new Promise((resolve) => {
    rl.question(`${c.yellow}?${c.reset} ${question} ${c.dim}${hint}${c.reset} `, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      if (trimmed === "") resolve(defaultYes);
      else resolve(trimmed === "y" || trimmed === "yes");
    });
  });
}
