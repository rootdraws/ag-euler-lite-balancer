import { encodeFunctionData, encodeAbiParameters, type Address, type Hex, zeroAddress } from 'viem'
import { readContract, simulateContract } from '@wagmi/vue/actions'
import { type SwapApiQuote, type SwapApiVerify, SwapVerificationType } from '~/entities/swap'
import { swapVerifierAbi } from '~/entities/euler/abis'
import { INTEREST_ADJUSTMENT_BPS, BPS_BASE } from '~/entities/tuning-constants'
import { vaultPreviewDepositAbi } from '~/abis/vault'

const HANDLER_GENERIC: Hex = '0x47656e6572696300000000000000000000000000000000000000000000000000'

const swapFunctionAbi = [{
  type: 'function' as const,
  name: 'swap',
  inputs: [{
    name: 'params',
    type: 'tuple',
    components: [
      { name: 'handler', type: 'bytes32' },
      { name: 'mode', type: 'uint256' },
      { name: 'account', type: 'address' },
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'vaultIn', type: 'address' },
      { name: 'accountIn', type: 'address' },
      { name: 'receiver', type: 'address' },
      { name: 'amountOut', type: 'uint256' },
      { name: 'data', type: 'bytes' },
    ],
  }],
  outputs: [],
  stateMutability: 'nonpayable' as const,
}]

const depositFunctionAbi = [{
  type: 'function' as const,
  name: 'deposit',
  inputs: [
    { name: 'token', type: 'address' },
    { name: 'vault', type: 'address' },
    { name: 'amountMin', type: 'uint256' },
    { name: 'account', type: 'address' },
  ],
  outputs: [],
  stateMutability: 'nonpayable' as const,
}]

const repayFunctionAbi = [{
  type: 'function' as const,
  name: 'repay',
  inputs: [
    { name: 'token', type: 'address' },
    { name: 'vault', type: 'address' },
    { name: 'repayAmount', type: 'uint256' },
    { name: 'account', type: 'address' },
  ],
  outputs: [],
  stateMutability: 'nonpayable' as const,
}]

export interface EnsoRouteResponse {
  tx: { to: Address; from: Address; data: Hex; value: string }
  amountOut: string
  minAmountOut: string
  route: Array<{ action: string; protocol: string }>
  gas?: string
}

export interface EnsoSwapQuoteContext {
  swapperAddress: Address
  swapVerifierAddress: Address
  collateralVault: Address
  borrowVault: Address
  subAccount: Address
  tokenIn: Address
  tokenOut: Address
  borrowAmount: bigint
  deadline: number
}

export interface EnsoRepayQuoteContext {
  swapperAddress: Address
  swapVerifierAddress: Address
  collateralVault: Address
  borrowVault: Address
  subAccount: Address
  tokenIn: Address
  tokenOut: Address
  withdrawAmount: bigint
  currentDebt: bigint
  deadline: number
}

export interface AdapterSwapQuoteContext extends EnsoSwapQuoteContext {
  adapterAddress: Address
  adapterCalldata: Hex
  minAmountOut: bigint
}

export interface BptAdapterConfigEntry {
  adapter: string
  tokenIndex: number
  pool: string
  wrapper: string
  numTokens: number
}

const BALANCER_ROUTER = '0x9dA18982a33FD0c7051B19F0d7C76F2d5E7e017c' as Address

const queryAddLiquidityAbi = [{
  type: 'function' as const,
  name: 'queryAddLiquidityUnbalanced',
  inputs: [
    { name: 'pool', type: 'address' },
    { name: 'exactAmountsIn', type: 'uint256[]' },
    { name: 'sender', type: 'address' },
    { name: 'userData', type: 'bytes' },
  ],
  outputs: [{ name: 'bptAmountOut', type: 'uint256' }],
  stateMutability: 'nonpayable' as const,
}]

export async function previewAdapterZapIn(
  config: Parameters<typeof readContract>[0],
  entry: BptAdapterConfigEntry,
  inputAmount: bigint,
  slippagePercent: number,
): Promise<{ expectedBptOut: bigint, minBptOut: bigint }> {
  const wrappedAmount = await readContract(config, {
    address: entry.wrapper as Address,
    abi: vaultPreviewDepositAbi,
    functionName: 'previewDeposit',
    args: [inputAmount],
  })

  const amountsIn = new Array(entry.numTokens).fill(0n) as bigint[]
  amountsIn[entry.tokenIndex] = wrappedAmount

  const { result: expectedBptOut } = await simulateContract(config, {
    address: BALANCER_ROUTER,
    abi: queryAddLiquidityAbi,
    functionName: 'queryAddLiquidityUnbalanced',
    args: [entry.pool as Address, amountsIn, zeroAddress, '0x'],
  })

  const slippageBps = Math.round(slippagePercent * 100)
  const minBptOut = expectedBptOut * BigInt(10000 - slippageBps) / 10000n

  return { expectedBptOut, minBptOut }
}

const zapInFunctionAbi = [{
  type: 'function' as const,
  name: 'zapIn',
  inputs: [
    { name: 'tokenIndex', type: 'uint256' },
    { name: 'amount', type: 'uint256' },
    { name: 'minBptOut', type: 'uint256' },
  ],
  outputs: [{ name: 'bptOut', type: 'uint256' }],
  stateMutability: 'nonpayable' as const,
}]

export function encodeAdapterZapIn(tokenIndex: number, amount: bigint, minBptOut: bigint): Hex {
  return encodeFunctionData({
    abi: zapInFunctionAbi,
    functionName: 'zapIn',
    args: [BigInt(tokenIndex), amount, minBptOut],
  })
}

export const useEnsoRoute = () => {
  const getEnsoRoute = async (params: {
    chainId: number
    fromAddress: Address
    tokenIn: Address
    tokenOut: Address
    amountIn: bigint
    receiver: Address
    slippage: number
  }): Promise<EnsoRouteResponse> => {
    const query = new URLSearchParams({
      chainId: String(params.chainId),
      fromAddress: params.fromAddress,
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      amountIn: params.amountIn.toString(),
      receiver: params.receiver,
      slippage: String(params.slippage),
      routingStrategy: 'router',
    })

    const response = await $fetch<string>(`/api/enso/route?${query.toString()}`, {
      method: 'GET',
      responseType: 'text',
    })

    const data = JSON.parse(response)
    if (!data.tx) {
      throw new Error(data.message || 'Enso route failed')
    }
    return data as EnsoRouteResponse
  }

  const buildEnsoSwapQuote = (
    ensoRoute: EnsoRouteResponse,
    ctx: EnsoSwapQuoteContext,
  ): SwapApiQuote => {
    const genericHandlerData = encodeAbiParameters(
      [{ type: 'address' }, { type: 'bytes' }],
      [ensoRoute.tx.to, ensoRoute.tx.data],
    )

    const swapCalldata = encodeFunctionData({
      abi: swapFunctionAbi,
      functionName: 'swap',
      args: [{
        handler: HANDLER_GENERIC,
        mode: 0n, // EXACT_IN
        account: ctx.subAccount,
        tokenIn: ctx.tokenIn,
        tokenOut: ctx.tokenOut,
        vaultIn: ctx.borrowVault,
        accountIn: ctx.subAccount,
        receiver: ctx.swapperAddress,
        amountOut: 0n,
        data: genericHandlerData,
      }],
    })

    const depositCalldata = encodeFunctionData({
      abi: depositFunctionAbi,
      functionName: 'deposit',
      args: [ctx.tokenOut, ctx.collateralVault, 0n, ctx.subAccount],
    })

    const minAmountOut = BigInt(ensoRoute.minAmountOut)
    const deadline = ctx.deadline

    const verifierData = encodeFunctionData({
      abi: swapVerifierAbi,
      functionName: 'verifyAmountMinAndSkim',
      args: [ctx.collateralVault, ctx.subAccount, minAmountOut, BigInt(deadline)],
    })

    const verify: SwapApiVerify = {
      verifierAddress: ctx.swapVerifierAddress,
      verifierData,
      type: SwapVerificationType.SkimMin,
      vault: ctx.collateralVault,
      account: ctx.subAccount,
      amount: minAmountOut.toString(),
      deadline,
    }

    const emptyToken = {
      chainId: 0,
      decimals: 18,
      logoURI: '',
      name: '',
      symbol: '',
    }

    return {
      amountIn: ctx.borrowAmount.toString(),
      amountInMax: ctx.borrowAmount.toString(),
      amountOut: ensoRoute.amountOut,
      amountOutMin: ensoRoute.minAmountOut,
      accountIn: ctx.subAccount,
      accountOut: ctx.subAccount,
      vaultIn: ctx.borrowVault,
      receiver: ctx.collateralVault,
      tokenIn: { ...emptyToken, address: ctx.tokenIn },
      tokenOut: { ...emptyToken, address: ctx.tokenOut },
      slippage: 300,
      swap: {
        swapperAddress: ctx.swapperAddress,
        swapperData: '0x' as Hex,
        multicallItems: [
          { functionName: 'swap', args: [], data: swapCalldata },
          { functionName: 'deposit', args: [], data: depositCalldata },
        ],
      },
      verify,
      route: [{ providerName: 'enso' }],
    }
  }

  const buildEnsoRepaySwapQuote = (
    ensoRoute: EnsoRouteResponse,
    ctx: EnsoRepayQuoteContext,
  ): SwapApiQuote => {
    const genericHandlerData = encodeAbiParameters(
      [{ type: 'address' }, { type: 'bytes' }],
      [ensoRoute.tx.to, ensoRoute.tx.data],
    )

    const swapCalldata = encodeFunctionData({
      abi: swapFunctionAbi,
      functionName: 'swap',
      args: [{
        handler: HANDLER_GENERIC,
        mode: 0n, // EXACT_IN
        account: ctx.subAccount,
        tokenIn: ctx.tokenIn,
        tokenOut: ctx.tokenOut,
        vaultIn: ctx.collateralVault,
        accountIn: ctx.subAccount,
        receiver: ctx.swapperAddress,
        amountOut: 0n,
        data: genericHandlerData,
      }],
    })

    const repayCalldata = encodeFunctionData({
      abi: repayFunctionAbi,
      functionName: 'repay',
      args: [
        ctx.tokenOut,
        ctx.borrowVault,
        BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'), // type(uint256).max
        ctx.subAccount,
      ],
    })

    const minAmountOut = BigInt(ensoRoute.minAmountOut)
    let maxDebtAfter = ctx.currentDebt - minAmountOut
    if (maxDebtAfter < 0n) maxDebtAfter = 0n
    const adjustedMaxDebt = (maxDebtAfter * INTEREST_ADJUSTMENT_BPS) / BPS_BASE

    const verifierData = encodeFunctionData({
      abi: swapVerifierAbi,
      functionName: 'verifyDebtMax',
      args: [ctx.borrowVault, ctx.subAccount, adjustedMaxDebt, BigInt(ctx.deadline)],
    })

    const verify: SwapApiVerify = {
      verifierAddress: ctx.swapVerifierAddress,
      verifierData,
      type: SwapVerificationType.DebtMax,
      vault: ctx.borrowVault,
      account: ctx.subAccount,
      amount: adjustedMaxDebt.toString(),
      deadline: ctx.deadline,
    }

    const emptyToken = {
      chainId: 0,
      decimals: 18,
      logoURI: '',
      name: '',
      symbol: '',
    }

    return {
      amountIn: ctx.withdrawAmount.toString(),
      amountInMax: ctx.withdrawAmount.toString(),
      amountOut: ensoRoute.amountOut,
      amountOutMin: ensoRoute.minAmountOut,
      accountIn: ctx.subAccount,
      accountOut: ctx.subAccount,
      vaultIn: ctx.collateralVault,
      receiver: ctx.borrowVault,
      tokenIn: { ...emptyToken, address: ctx.tokenIn },
      tokenOut: { ...emptyToken, address: ctx.tokenOut },
      slippage: 300,
      swap: {
        swapperAddress: ctx.swapperAddress,
        swapperData: '0x' as Hex,
        multicallItems: [
          { functionName: 'swap', args: [], data: swapCalldata },
          { functionName: 'repay', args: [], data: repayCalldata },
        ],
      },
      verify,
      route: [{ providerName: 'enso' }],
    }
  }

  const buildAdapterSwapQuote = (ctx: AdapterSwapQuoteContext): SwapApiQuote => {
    const genericHandlerData = encodeAbiParameters(
      [{ type: 'address' }, { type: 'bytes' }],
      [ctx.adapterAddress, ctx.adapterCalldata],
    )

    const swapCalldata = encodeFunctionData({
      abi: swapFunctionAbi,
      functionName: 'swap',
      args: [{
        handler: HANDLER_GENERIC,
        mode: 0n,
        account: ctx.subAccount,
        tokenIn: ctx.tokenIn,
        tokenOut: ctx.tokenOut,
        vaultIn: ctx.borrowVault,
        accountIn: ctx.subAccount,
        receiver: ctx.swapperAddress,
        amountOut: 0n,
        data: genericHandlerData,
      }],
    })

    const depositCalldata = encodeFunctionData({
      abi: depositFunctionAbi,
      functionName: 'deposit',
      args: [ctx.tokenOut, ctx.collateralVault, 0n, ctx.subAccount],
    })

    const verifierData = encodeFunctionData({
      abi: swapVerifierAbi,
      functionName: 'verifyAmountMinAndSkim',
      args: [ctx.collateralVault, ctx.subAccount, ctx.minAmountOut, BigInt(ctx.deadline)],
    })

    const verify: SwapApiVerify = {
      verifierAddress: ctx.swapVerifierAddress,
      verifierData,
      type: SwapVerificationType.SkimMin,
      vault: ctx.collateralVault,
      account: ctx.subAccount,
      amount: ctx.minAmountOut.toString(),
      deadline: ctx.deadline,
    }

    const emptyToken = {
      chainId: 0,
      decimals: 18,
      logoURI: '',
      name: '',
      symbol: '',
    }

    return {
      amountIn: ctx.borrowAmount.toString(),
      amountInMax: ctx.borrowAmount.toString(),
      amountOut: '0',
      amountOutMin: ctx.minAmountOut.toString(),
      accountIn: ctx.subAccount,
      accountOut: ctx.subAccount,
      vaultIn: ctx.borrowVault,
      receiver: ctx.collateralVault,
      tokenIn: { ...emptyToken, address: ctx.tokenIn },
      tokenOut: { ...emptyToken, address: ctx.tokenOut },
      slippage: 300,
      swap: {
        swapperAddress: ctx.swapperAddress,
        swapperData: '0x' as Hex,
        multicallItems: [
          { functionName: 'swap', args: [], data: swapCalldata },
          { functionName: 'deposit', args: [], data: depositCalldata },
        ],
      },
      verify,
      route: [{ providerName: 'balancer-adapter' }],
    }
  }

  return {
    getEnsoRoute,
    buildEnsoSwapQuote,
    buildEnsoRepaySwapQuote,
    buildAdapterSwapQuote,
  }
}
