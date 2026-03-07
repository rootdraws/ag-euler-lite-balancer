# Euler Lite — Balancer Frontend Context

AI context file for the **Balancer-specific** Euler Lite frontend. This is a fork of the shared `euler-lite` frontend, customized for Balancer V3 BPT vault markets on Monad.

**Repo:** `rootdraws/ag-euler-lite-balancer`
**Contract context:** See `../balancer-contracts/balancer-claude.md` for vault + adapter deployment details.
**Shared frontend context:** See `../CLAUDE.md` for the base euler-lite architecture (pages, composables, theming, labels, etc.). Everything in CLAUDE.md applies here unless overridden below.

---

## What's different from the shared euler-lite

This frontend adds **multiply/leverage** support for Balancer V3 BPT collateral vaults. The shared euler-lite has a multiply feature, but it relies on the Euler Swap API for quote routing. BPT vaults can't use the standard swap API — they need either Enso Finance routing or a custom adapter for the AUSD → BPT conversion.

### New files

| File | Purpose |
|---|---|
| `composables/useEnsoRoute.ts` | Fetches Enso `/route` quotes, transforms them into `SwapApiQuote` objects. Also builds adapter-based quotes using `GenericHandler` encoding. |
| `server/api/enso/route.get.ts` | Server-side proxy for Enso API calls (keeps API key server-side). |
| `server/utils/enso.ts` | Enso API URL + key config helper. |

### Modified files

| File | Change |
|---|---|
| `composables/borrow/useMultiplyForm.ts` | Detects adapter config → uses `buildAdapterSwapQuote` for Pools 1,4; Enso for Pools 2,3. |
| `composables/repay/useCollateralSwapRepay.ts` | Uses Enso for all BPT→borrow repay quotes (adapter zapOut blocked by pool hooks). |
| `composables/repay/useRepaySwapCore.ts` | Extended `customQuoteFetcher` to support reactive ref/computed for adapter detection. |
| `composables/useDeployConfig.ts` | Added `bptAdapterConfig` — parsed from `NUXT_PUBLIC_CONFIG_BPT_ADAPTER_CONFIG` env var. |
| `composables/useEnvConfig.ts` | Added `ensoApiUrl` for the Enso proxy endpoint. |
| `composables/useSwapQuotesParallel.ts` | `requestCustomQuote` allows injecting pre-built `SwapApiQuote` objects. |
| `nuxt.config.ts` | Added `configBptAdapterConfig` to runtime config. |
| `server/plugins/app-config.ts` | Injects `configBptAdapterConfig` into window config. |
| `pages/position/[number]/multiply.vue` | Same adapter detection logic as `useMultiplyForm.ts` for existing position multiply. |
| `.env.example` | Documents new env vars for Enso and adapter config. |

---

## Multiply Architecture

### How multiply works (EVC batch)

```
1. EVC.borrow(borrowVault, amount)        → AUSD to Swapper
2. Swapper.multicall([
     swap(GenericHandler, adapter/enso)    → AUSD becomes BPT
     deposit(BPT, collateralVault)         → BPT into Euler
   ])
3. SwapVerifier.verifyAmountMinAndSkim     → slippage check
```

### Routing decision (per pool)

| Pool | Collateral Vault | Multiply Route | Repay Route |
|---|---|---|---|
| Pool 1 (wnAUSD/wnUSDC/wnUSDT0) | `0x5795...0436` | **Adapter** `0xC904...Bf98` | Enso |
| Pool 2 (sMON/wnWMON) | `0x578c...0Ea5` | Enso | Enso |
| Pool 3 (shMON/wnWMON) | `0x6660...Ed7` | Enso | Enso |
| Pool 4 (wnLOAZND/AZND/wnAUSD) | `0x1758...9F92` | **Adapter** `0x8753...c832` | Enso |

The decision is driven by the `bptAdapterConfig` map. If a collateral vault address has an entry, the adapter path is used for multiply. Otherwise, Enso is called. Repay always uses Enso (pool hooks block the adapter's `removeLiquiditySingleTokenExactIn`).

### Quote flow

**Adapter multiply (Pools 1, 4):**
1. `useMultiplyForm` detects `bptAdapterConfig[collateralVaultAddr]`
2. Calls `encodeAdapterZapIn(tokenIndex, borrowAmount, 0n)` to build adapter calldata
3. Calls `buildAdapterSwapQuote()` which encodes: `GenericHandler` data → `Swapper.swap` → `Swapper.deposit`
4. Injects as custom quote via `requestMultiplyCustomQuote('balancer-adapter', ...)`

**Enso multiply (Pools 2, 3):**
1. No adapter entry found
2. Calls `getEnsoRoute()` via server proxy → Enso `/route` API
3. Calls `buildEnsoSwapQuote()` to wrap Enso route in `SwapApiQuote` format
4. Injects as custom quote via `requestMultiplyCustomQuote('enso', ...)`

**Enso repay (all pools):**
1. `useCollateralSwapRepay` → `ensoRepayFetcher`
2. Always calls `getEnsoRoute(BPT → borrowAsset)`
3. Calls `buildEnsoRepaySwapQuote()` with `SwapVerificationType.DebtMax`

---

## Environment Variables (new)

```bash
# Enso Finance API (server-side only, proxied via /api/enso/route)
ENSO_API_KEY=<your-enso-api-key>
ENSO_API_URL=https://api.enso.build

# Enable multiply for BPT vaults
NUXT_PUBLIC_CONFIG_ENABLE_ENSO_MULTIPLY=true

# Adapter config: collateral vault → {adapter address, tokenIndex}
# Only needed for pools where Enso can't route the forward direction
NUXT_PUBLIC_CONFIG_BPT_ADAPTER_CONFIG={"0x5795...":{"adapter":"0xC904...","tokenIndex":1},"0x1758...":{"adapter":"0x8753...","tokenIndex":1}}
```

---

## Key Composable: `useEnsoRoute.ts`

This is the bridge between Enso/adapter and Euler's swap system.

**Exports:**
- `getEnsoRoute(params)` — Fetches Enso `/route` via server proxy. Returns raw Enso response with `tx.to`, `tx.data`, `amountOut`.
- `buildEnsoSwapQuote(route, ctx)` — Wraps Enso route data into `SwapApiQuote` for multiply. Uses `HANDLER_GENERIC` with Enso router as target.
- `buildEnsoRepaySwapQuote(route, ctx)` — Same for repay direction. Uses `SwapVerificationType.DebtMax` with interest adjustment buffer.
- `buildAdapterSwapQuote(ctx)` — Builds `SwapApiQuote` for adapter-based multiply. Encodes `GenericHandler` data targeting the adapter's `zapIn`.
- `encodeAdapterZapIn(tokenIndex, amount, minBptOut)` — Encodes adapter calldata.

The `HANDLER_GENERIC` bytes32 (`0x47656e65726963...`) identifies the Euler Swapper's GenericHandler. The handler decodes `(address target, bytes payload)` from `params.data`, approves `tokenIn` to the target, then calls `target.call(payload)`.

---

## Gotchas

1. **Enso API key must be server-side.** The proxy at `/api/enso/route` keeps the key out of the browser. Never expose it in `NUXT_PUBLIC_*` vars.

2. **Enso has a 1 RPS rate limit.** Multiple rapid quote fetches will 429. The parallel quote system handles this gracefully.

3. **`bptAdapterConfig` keys are vault addresses, not BPT addresses.** The config maps **Euler collateral vault** addresses, since that's what the multiply form works with. The adapter itself knows the BPT/pool address.

4. **Pool hooks block single-sided removal.** `AfterRemoveLiquidityHookFailed()` on `removeLiquiditySingleTokenExactIn` for all callers, not just the adapter. This is a Balancer pool-level restriction. Enso routes around it for repay.

5. **Interest adjustment on repay verification.** `buildEnsoRepaySwapQuote` adds `INTEREST_ADJUSTMENT_BPS` buffer to `verifyDebtMax` to account for Euler's internal interest accrual between tx submission and execution.

6. **Adapter addresses change on redeploy.** If the adapter contract is updated, new addresses must be set in both `NUXT_PUBLIC_CONFIG_BPT_ADAPTER_CONFIG` and the Enso fallback logic. The adapter is stateless — old deploys can be abandoned.
