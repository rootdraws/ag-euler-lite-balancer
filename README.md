# Euler Lite

## Overview

Euler Lite provides all the core functionality of Euler Finance in a customizable package:

- **Lending & Borrowing**: Users can deposit assets to earn yield or borrow against collateral
- **Portfolio Management**: Track positions and performance
- **Rewards**: Participate in Merkl/Brevis reward programs
- **Multi-chain Support**: Connect to multiple EVM-compatible networks

## Prerequisites

- **Node.js** 18+ (recommended: 20.12.2)
- **npm** package manager
- **Git**
- A **Reown Project ID** (formerly WalletConnect) - get one at [reown.com](https://reown.com/)

## Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd euler-lite
npm install
```

### 2. Environment Configuration

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

#### Required Variables

| Variable | Description |
|----------|-------------|
| `APPKIT_PROJECT_ID` | Reown (WalletConnect) project ID |
| `NUXT_PUBLIC_APP_URL` | Your app's public URL |
| `RPC_URL_HTTP_<chainId>` | RPC endpoint per chain (e.g. `RPC_URL_HTTP_1` for Ethereum) |
| `NUXT_PUBLIC_SUBGRAPH_URI_<chainId>` | Subgraph URI per chain |

#### API URLs

| Variable | Default | Description |
|----------|---------|-------------|
| `EULER_API_URL` | — | Euler indexer API (token data, logos) |
| `SWAP_API_URL` | — | Euler swap API |
| `PRICE_API_URL` | — | Euler price API |
| `PYTH_HERMES_URL` | `https://hermes.pyth.network` | Pyth oracle endpoint |

> **Doppler compatibility:** If your secret manager injects `NUXT_PUBLIC_*` prefixed names (e.g. `NUXT_PUBLIC_EULER_API_URL`), the app accepts both forms automatically.

#### Branding & Feature Flags

These use Nuxt's `runtimeConfig` and are set via `NUXT_PUBLIC_CONFIG_*` env vars:

| Variable | Default | Description |
|----------|---------|-------------|
| `NUXT_PUBLIC_CONFIG_APP_TITLE` | `Euler Lite` | App title (SEO, meta tags) |
| `NUXT_PUBLIC_CONFIG_APP_DESCRIPTION` | `Lightweight interface for Euler Finance.` | App description |
| `NUXT_PUBLIC_CONFIG_LABELS_REPO` | `euler-xyz/euler-labels` | GitHub labels repo |
| `NUXT_PUBLIC_CONFIG_LABELS_REPO_BRANCH` | `master` | Branch to fetch labels from |
| `NUXT_PUBLIC_CONFIG_DOCS_URL` | — | Documentation link |
| `NUXT_PUBLIC_CONFIG_TOS_URL` | — | Terms of Service link |
| `NUXT_PUBLIC_CONFIG_TOS_MD_URL` | — | TOS markdown URL (enables TOS signing when set) |
| `NUXT_PUBLIC_CONFIG_X_URL` | — | X (Twitter) link |
| `NUXT_PUBLIC_CONFIG_DISCORD_URL` | — | Discord link |
| `NUXT_PUBLIC_CONFIG_TELEGRAM_URL` | — | Telegram link |
| `NUXT_PUBLIC_CONFIG_GITHUB_URL` | — | GitHub link |
| `NUXT_PUBLIC_CONFIG_ENABLE_EARN_PAGE` | `true` | Show Earn page |
| `NUXT_PUBLIC_CONFIG_ENABLE_LEND_PAGE` | `true` | Show Lend page |
| `NUXT_PUBLIC_CONFIG_ENABLE_ENTITY_BRANDING` | `true` | Show entity branding |
| `NUXT_PUBLIC_CONFIG_ENABLE_VAULT_TYPE` | `true` | Show vault type labels |
| `NUXT_PUBLIC_CONFIG_ENABLE_SWAP_DEPOSIT` | `false` | Enable swap token selector on deposit/withdraw/borrow |

#### Chain Configuration

Chains are configured dynamically at runtime. Each chain requires two env vars:

```bash
# Ethereum Mainnet
RPC_URL_HTTP_1=https://your-rpc-endpoint.com
NUXT_PUBLIC_SUBGRAPH_URI_1=https://api.goldsky.com/.../euler-simple-mainnet/latest/gn

# Arbitrum
RPC_URL_HTTP_42161=https://your-arbitrum-rpc.com
NUXT_PUBLIC_SUBGRAPH_URI_42161=https://api.goldsky.com/.../euler-simple-arbitrum/latest/gn
```

The app scans for `RPC_URL_HTTP_<chainId>` env vars at server startup and automatically enables those chains. No code changes needed to add or remove chains.

### 3. Customize Your Instance

#### Theme (`entities/custom.ts`)

The `themeHue` value (0-360) shifts the entire color palette:

```typescript
export const themeHue = 150 // Change to shift brand palette
```

#### Intrinsic APY Sources (`entities/custom.ts`)

Configure which tokens show DeFiLlama base APY:

```typescript
export const intrinsicApySources = [
  { symbol: 'steth', project: 'lido' },
  { symbol: 'wsteth', sourceSymbol: 'steth', project: 'lido' },
  // Add your tokens here
] as const
```

- `symbol` — vault asset symbol (case-insensitive)
- `project` — DefiLlama project slug (from https://yields.llama.fi/pools)
- `sourceSymbol` — optional; use when the vault asset is wrapped but APY is tied to another symbol

#### Favicon

Replace the favicon files in `public/favicons/`:

- `favicon.ico`
- `favicon.svg`

#### Token Icons

Token icons are loaded from the Euler Indexer API (`EULER_API_URL/v1/tokens`). Each token's `logoURI` field provides the icon URL.

To override an icon for a specific token, add a file to `assets/tokens/`:

```
assets/tokens/
  eul.png       # overrides the EUL token icon
  mytoken.png   # overrides MYTOKEN icon
```

The resolution order in `getAssetLogoUrl(address, symbol)`:
1. Local override in `assets/tokens/<symbol>.png`
2. `logoURI` from the indexer API
3. Empty string (component shows initials fallback)

#### EulerEarn Vaults

If using a custom labels repository, create chain-specific `earn-vaults.json` files to curate which EulerEarn vaults appear:

```
your-labels-repo/
├── 1/earn-vaults.json          # Ethereum
├── 42161/earn-vaults.json      # Arbitrum
└── 8453/earn-vaults.json       # Base
```

Each file is a JSON array of vault addresses:

```json
[
  "0x1234567890123456789012345678901234567890",
  "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"
]
```

When using the default `euler-xyz/euler-labels` repository, all verified EulerEarn vaults are shown automatically.

### 4. Development

```bash
npm run dev
```

The app will be available at `http://localhost:3000`.

For HTTPS in local development, set `HTTPS_KEY` and `HTTPS_CERT` env vars pointing to your certificate files.

### 5. Build for Production

```bash
npm run build
npm run preview   # preview locally
```

## Docker Deployment

The project includes a Dockerfile that uses [Doppler](https://doppler.com) for runtime secret injection:

```bash
docker build --build-arg APP_PORT=3000 -t euler-lite .

docker run -p 3000:3000 \
  -e DOPPLER_TOKEN=your-doppler-token \
  -e DOPPLER_PROJECT=euler-lite \
  -e DOPPLER_CONFIG=production \
  euler-lite
```

Doppler injects all environment variables at runtime. The server plugins scan the injected env vars and pass config to the client via `window.__APP_CONFIG__` and `window.__CHAIN_CONFIG__`.

To run without Doppler, override the `CMD` and pass env vars directly:

```bash
docker run -p 3000:3000 \
  -e EULER_API_URL=https://indexer.euler.finance \
  -e SWAP_API_URL=https://swap.euler.finance \
  -e PRICE_API_URL=https://indexer.euler.finance \
  -e APPKIT_PROJECT_ID=your-project-id \
  -e RPC_URL_HTTP_1=https://your-rpc.com \
  -e NUXT_PUBLIC_SUBGRAPH_URI_1=https://your-subgraph.com \
  euler-lite node .output/server/index.mjs
```

## Project Structure

```
assets/
  styles/variables.scss    # Theme colors and CSS variables
  tokens/                  # Token icon overrides
components/                # Vue components organized by feature
composables/
  useEnvConfig.ts          # Runtime env config (API URLs, Pyth, Reown)
  useDeployConfig.ts       # Branding, social links, feature flags
  useChainConfig.ts        # Dynamic chain derivation from env vars
  useEulerConfig.ts        # Aggregated config for Euler services
  useTokens.ts             # Token data fetching and icon resolution
  useEulerOperations.ts    # Operation builders (deposit, borrow, etc.)
entities/
  custom.ts                # Theme hue and intrinsic APY sources
  vault.ts                 # Vault types and fetching
  account.ts               # Position types
pages/                     # Nuxt pages/routes
plugins/
  00.wagmi.ts              # Wagmi/Reown wallet configuration
public/
  favicons/                # Favicon files
server/
  plugins/app-config.ts    # Injects env config into HTML
  plugins/chain-config.ts  # Injects chain config into HTML
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build locally |
| `npm run generate` | Generate static site |
| `npm run postinstall` | Prepare Nuxt (runs automatically) |

## Configuration Checklist

Before deploying:

- [ ] Copied `.env.example` to `.env` and filled in values
- [ ] Set `APPKIT_PROJECT_ID` and `NUXT_PUBLIC_APP_URL`
- [ ] Set `EULER_API_URL`, `SWAP_API_URL`, `PRICE_API_URL`
- [ ] Added at least one `RPC_URL_HTTP_<chainId>` with matching `NUXT_PUBLIC_SUBGRAPH_URI_<chainId>`
- [ ] Configured branding via `NUXT_PUBLIC_CONFIG_*` env vars (title, description, social links)
- [ ] Set `themeHue` in `entities/custom.ts`
- [ ] Replaced favicon files in `public/favicons/`
- [ ] Added token icon overrides in `assets/tokens/` (if needed)

## Troubleshooting

### Token logos not loading

- Verify `EULER_API_URL` is set correctly. If using Doppler, ensure the env var name matches (`EULER_API_URL` or `NUXT_PUBLIC_EULER_API_URL`).
- Check the browser console for failed `/v1/tokens` requests.

### Build Errors

- Ensure Node.js version is 18+ (20.12.2 recommended)
- Clear and reinstall: `rm -rf node_modules && npm install`

### Wallet Connection Issues

- Verify `APPKIT_PROJECT_ID` is correct (or `NUXT_PUBLIC_APP_KIT_PROJECT_ID` for Doppler)
- Ensure `NUXT_PUBLIC_APP_URL` matches your domain
- Check browser console for errors

### No Chains Available

- Ensure at least one `RPC_URL_HTTP_<chainId>` env var is set
- Each chain needs a matching `NUXT_PUBLIC_SUBGRAPH_URI_<chainId>`

## Additional Resources

- [Nuxt.js Documentation](https://nuxt.com/docs)
- [Reown (WalletConnect) Documentation](https://docs.reown.com/)
- [Euler Finance Documentation](https://docs.euler.finance/)
