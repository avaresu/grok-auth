# grok-auth

> CLI for switching and managing multiple Grok Build CLI accounts.

`grok-auth` is a command-line tool for managing multiple [Grok Build CLI](https://x.ai) accounts. Switch between xAI accounts instantly without logging in and out.

## Features

- **Multi-account management** — Store multiple xAI/Grok accounts and switch between them
- **Instant switching** — Switch accounts in seconds, no re-authentication needed
- **Cross-platform** — Works on Windows, Linux, and macOS
- **Zero dependencies** — Pure Node.js, no external packages required
- **Interactive & scriptable** — Interactive picker UI or direct CLI arguments
- **Import/Export** — Transfer accounts between machines easily
- **Alias support** — Give friendly names to your accounts

## Install

```bash
# Install globally from GitHub
npm install -g https://github.com/avaresu/grok-auth.git

# Or run from source
git clone https://github.com/avaresu/grok-auth.git
cd grok-auth
npm link
```

## Quick Start

```bash
# Add your first account (runs grok login)
grok-auth login

# Add another account
grok-auth login

# List all accounts
grok-auth list

# Switch accounts interactively
grok-auth switch

# Switch by number
grok-auth switch 2

# Switch to previous account
grok-auth switch -
```

## Commands

### Account Management

| Command | Description |
|---------|-------------|
| `grok-auth list [--json]` | List all stored accounts |
| `grok-auth login [--device-auth] [--oauth]` | Run `grok login` and register the account |
| `grok-auth switch` | Switch account interactively |
| `grok-auth switch <query>` | Switch by number, email, or alias |
| `grok-auth switch -` | Switch to the previous account |
| `grok-auth remove [query]` | Remove an account |
| `grok-auth remove --all` | Remove all accounts |
| `grok-auth alias <query> <name>` | Set a friendly alias |

### Data Transfer

| Command | Description |
|---------|-------------|
| `grok-auth export [file]` | Export accounts to JSON file |
| `grok-auth import <file>` | Import accounts from JSON file |

### Shortcuts

```bash
grok-auth 2              # Switch to account #2
grok-auth -              # Switch to previous account
grok-auth user@email     # Switch by email match
grok-auth ls             # Alias for 'list'
grok-auth sw             # Alias for 'switch'
grok-auth rm             # Alias for 'remove'
```

## How It Works

Grok Build CLI stores its authentication in `~/.grok/auth.json`. `grok-auth` extends this by:

1. **Backing up** each account's credentials in `~/.grok/accounts/`
2. **Tracking** all accounts in a registry (`~/.grok/accounts/grok-auth-registry.json`)
3. **Switching** by writing the selected account to `~/.grok/auth.json`

> **Important:** After switching accounts, restart your Grok CLI session for the change to take effect.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GROK_HOME` | Override the grok config directory (default: `~/.grok`) |
| `GROK_AUTH_DEBUG` | Enable debug output |

## Transfer Accounts Between Machines

```bash
# On source machine
grok-auth export my-accounts.json

# Copy file to target machine, then:
grok-auth import my-accounts.json
```

## Supported Platforms

| Platform | Status |
|----------|--------|
| Windows (PowerShell) | ✅ Tested |
| Linux (bash/zsh) | ✅ Supported |
| macOS | ✅ Supported |

## Requirements

- Node.js >= 18.0.0
- [Grok Build CLI](https://x.ai) installed

## License

MIT
