import { useAccount, useConfig } from '@wagmi/vue'
import { formatUnits, parseUnits, type Address } from 'viem'
import { useModal } from '~/components/ui/composables/useModal'
import { OperationReviewModal } from '#components'
import { useToast } from '~/components/ui/composables/useToast'
import { type SwapApiQuote, SwapperMode } from '~/entities/swap'
import {
  useEnsoRoute,
  encodeAdapterZapIn,
  previewAdapterZapIn,
  type BptAdapterConfigEntry,
} from '~/composables/useEnsoRoute'
import { logWarn } from '~/utils/errorHandling'
import { getTxErrorMessage } from '~/utils/tx-errors'

export interface LoopZapPool {
  id: string
  name: string
  collateralVault: string
  borrowVault: string
  borrowAsset: string
  borrowAssetSymbol: string
  borrowAssetDecimals: number
  inputTokens: { address: string, symbol: string, decimals: number }[]
  routeType: 'adapter' | 'enso'
  bptAddress: string
}

const POOLS: LoopZapPool[] = [
  {
    id: 'pool1',
    name: 'Stableswap (USDT0/AUSD/USDC)',
    collateralVault: '0x5795130BFb9232C7500C6E57A96Fdd18bFA60436',
    borrowVault: '0x438cedcE647491B1d93a73d491eC19A50194c222',
    borrowAsset: '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a',
    borrowAssetSymbol: 'AUSD',
    borrowAssetDecimals: 18,
    inputTokens: [
      { address: '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a', symbol: 'AUSD', decimals: 18 },
    ],
    routeType: 'adapter',
    bptAddress: '0x2DAA146dfB7EAef0038F9F15B2EC1e4DE003f72b',
  },
  {
    id: 'pool2',
    name: 'sMON/WMON (Kintsu)',
    collateralVault: '0x578c60e6Df60336bE41b316FDE74Aa3E2a4E0Ea5',
    borrowVault: '0x75B6C392f778B8BCf9bdB676f8F128b4dD49aC19',
    borrowAsset: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A',
    borrowAssetSymbol: 'WMON',
    borrowAssetDecimals: 18,
    inputTokens: [
      { address: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A', symbol: 'WMON', decimals: 18 },
    ],
    routeType: 'enso',
    bptAddress: '0x3475Ea1c3451a9a10Aeb51bd8836312175B88BAc',
  },
  {
    id: 'pool3',
    name: 'shMON/WMON (Fastlane)',
    collateralVault: '0x6660195421557BC6803e875466F99A764ae49Ed7',
    borrowVault: '0x75B6C392f778B8BCf9bdB676f8F128b4dD49aC19',
    borrowAsset: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A',
    borrowAssetSymbol: 'WMON',
    borrowAssetDecimals: 18,
    inputTokens: [
      { address: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A', symbol: 'WMON', decimals: 18 },
    ],
    routeType: 'enso',
    bptAddress: '0x150360c0eFd098A6426060Ee0Cc4a0444c4b4b68',
  },
  {
    id: 'pool4',
    name: 'AZND/AUSD/LOAZND',
    collateralVault: '0x175831aF06c30F2EA5EA1e3F5EBA207735Eb9F92',
    borrowVault: '0x438cedcE647491B1d93a73d491eC19A50194c222',
    borrowAsset: '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a',
    borrowAssetSymbol: 'AUSD',
    borrowAssetDecimals: 18,
    inputTokens: [
      { address: '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a', symbol: 'AUSD', decimals: 18 },
    ],
    routeType: 'adapter',
    bptAddress: '0xD328E74AdD15Ac98275737a7C1C884ddc951f4D3',
  },
]

const MULTIPLIER_OPTIONS = [2, 3, 4, 5]

export const useLoopZap = () => {
  const wagmiConfig = useConfig()
  const { address, isConnected } = useAccount()
  const { buildLoopZapPlan, executeTxPlan, simulateTxPlan } = useEulerOperations()
  const { eulerPeripheryAddresses, chainId: currentChainId } = useEulerAddresses()
  const { refreshAllPositions } = useEulerAccount()
  const { eulerLensAddresses } = useEulerAddresses()
  const { fetchSingleBalance } = useWallets()
  const { slippage } = useSlippage()
  const { bptAdapterConfig } = useDeployConfig()
  const { getEnsoRoute, buildEnsoSwapQuote, buildAdapterSwapQuote } = useEnsoRoute()
  const modal = useModal()
  const { error: showError } = useToast()

  const selectedPoolId = ref<string>(POOLS[0].id)
  const selectedMultiplier = ref<number>(3)
  const inputAmount = ref<string>('')
  const inputTokenAddress = ref<string>('')

  const isQuoting = ref(false)
  const isPreparing = ref(false)
  const isSubmitting = ref(false)
  const quoteError = ref<string | null>(null)
  const simulationError = ref<string>('')

  const zapQuote = ref<SwapApiQuote | null>(null)
  const multiplyQuote = ref<SwapApiQuote | null>(null)
  const walletBalance = ref<bigint>(0n)
  const expectedBptTotal = ref<bigint>(0n)

  const selectedPool = computed(() => POOLS.find(p => p.id === selectedPoolId.value)!)

  const selectedInputToken = computed(() => {
    const pool = selectedPool.value
    if (!pool) return null
    const token = pool.inputTokens.find(t => t.address === inputTokenAddress.value)
    return token || pool.inputTokens[0]
  })

  watch(selectedPoolId, () => {
    const pool = POOLS.find(p => p.id === selectedPoolId.value)
    if (pool) {
      inputTokenAddress.value = pool.inputTokens[0].address
      inputAmount.value = ''
      resetQuoteState()
    }
  }, { immediate: true })

  const inputAmountNano = computed(() => {
    const token = selectedInputToken.value
    if (!token || !inputAmount.value) return 0n
    try {
      return parseUnits(inputAmount.value, token.decimals)
    }
    catch {
      return 0n
    }
  })

  const debtAmount = computed(() => {
    const input = inputAmountNano.value
    if (input <= 0n) return 0n
    return input * BigInt(selectedMultiplier.value - 1)
  })

  const totalExposure = computed(() => {
    const input = inputAmountNano.value
    if (input <= 0n) return 0n
    return input * BigInt(selectedMultiplier.value)
  })

  const borrowAmountFormatted = computed(() => {
    const pool = selectedPool.value
    if (!pool || debtAmount.value <= 0n) return '0'
    return formatUnits(debtAmount.value, pool.borrowAssetDecimals)
  })

  const totalExposureFormatted = computed(() => {
    const pool = selectedPool.value
    if (!pool || totalExposure.value <= 0n) return '0'
    return formatUnits(totalExposure.value, pool.borrowAssetDecimals)
  })

  const isReady = computed(() => {
    return isConnected.value
      && inputAmountNano.value > 0n
      && inputAmountNano.value <= walletBalance.value
      && zapQuote.value !== null
      && multiplyQuote.value !== null
      && !quoteError.value
  })

  function resetQuoteState() {
    zapQuote.value = null
    multiplyQuote.value = null
    quoteError.value = null
    expectedBptTotal.value = 0n
    simulationError.value = ''
  }

  async function updateBalance() {
    const token = selectedInputToken.value
    if (!token || !isConnected.value) {
      walletBalance.value = 0n
      return
    }
    walletBalance.value = await fetchSingleBalance(token.address)
  }

  watch([selectedInputToken, isConnected], () => updateBalance(), { immediate: true })

  const fetchQuotes = useDebounceFn(async () => {
    resetQuoteState()

    const pool = selectedPool.value
    const input = inputAmountNano.value
    const debt = debtAmount.value
    if (!pool || input <= 0n || debt <= 0n) return
    if (!eulerPeripheryAddresses.value?.swapper || !currentChainId.value) return

    isQuoting.value = true
    quoteError.value = null

    try {
      const swapperAddr = eulerPeripheryAddresses.value.swapper as Address
      const swapVerifierAddr = eulerPeripheryAddresses.value.swapVerifier as Address
      const collateralVaultAddr = pool.collateralVault as Address
      const borrowVaultAddr = pool.borrowVault as Address
      const tokenIn = pool.borrowAsset as Address
      const tokenOut = pool.bptAddress as Address
      const deadline = Math.floor(Date.now() / 1000) + 1800

      const subAccount = address.value as Address

      const buildQuoteCtx = (amount: bigint) => ({
        swapperAddress: swapperAddr,
        swapVerifierAddress: swapVerifierAddr,
        collateralVault: collateralVaultAddr,
        borrowVault: borrowVaultAddr,
        subAccount,
        tokenIn,
        tokenOut,
        borrowAmount: amount,
        deadline,
      })

      const adapterEntry = bptAdapterConfig[collateralVaultAddr.toLowerCase()]
        || bptAdapterConfig[pool.collateralVault]

      if (pool.routeType === 'adapter' && adapterEntry?.pool && adapterEntry?.wrapper && adapterEntry?.numTokens) {
        const fullEntry = adapterEntry as BptAdapterConfigEntry

        const [zapPreview, multiplyPreview] = await Promise.all([
          previewAdapterZapIn(wagmiConfig, fullEntry, input, slippage.value),
          previewAdapterZapIn(wagmiConfig, fullEntry, debt, slippage.value),
        ])

        const zapCalldata = encodeAdapterZapIn(fullEntry.tokenIndex, input, zapPreview.minBptOut)
        const multiplyCalldata = encodeAdapterZapIn(fullEntry.tokenIndex, debt, multiplyPreview.minBptOut)

        const zq = buildAdapterSwapQuote({
          ...buildQuoteCtx(input),
          adapterAddress: fullEntry.adapter as Address,
          adapterCalldata: zapCalldata,
          minAmountOut: zapPreview.minBptOut,
        })
        zq.amountOut = zapPreview.expectedBptOut.toString()
        zq.amountOutMin = zapPreview.minBptOut.toString()

        const mq = buildAdapterSwapQuote({
          ...buildQuoteCtx(debt),
          adapterAddress: fullEntry.adapter as Address,
          adapterCalldata: multiplyCalldata,
          minAmountOut: multiplyPreview.minBptOut,
        })
        mq.amountOut = multiplyPreview.expectedBptOut.toString()
        mq.amountOutMin = multiplyPreview.minBptOut.toString()

        zapQuote.value = zq
        multiplyQuote.value = mq
        expectedBptTotal.value = zapPreview.expectedBptOut + multiplyPreview.expectedBptOut
      }
      else {
        const chainId = currentChainId.value
        const [zapEnsoRoute, multiplyEnsoRoute] = await Promise.all([
          getEnsoRoute({
            chainId,
            fromAddress: swapperAddr,
            tokenIn,
            tokenOut,
            amountIn: input,
            receiver: swapperAddr,
            slippage: slippage.value,
          }),
          getEnsoRoute({
            chainId,
            fromAddress: swapperAddr,
            tokenIn,
            tokenOut,
            amountIn: debt,
            receiver: swapperAddr,
            slippage: slippage.value,
          }),
        ])

        zapQuote.value = buildEnsoSwapQuote(zapEnsoRoute, buildQuoteCtx(input))
        multiplyQuote.value = buildEnsoSwapQuote(multiplyEnsoRoute, buildQuoteCtx(debt))
        expectedBptTotal.value = BigInt(zapEnsoRoute.amountOut) + BigInt(multiplyEnsoRoute.amountOut)
      }
    }
    catch (e: any) {
      quoteError.value = e?.message || 'Failed to get quote'
      logWarn('loop-zap/quote', e)
    }
    finally {
      isQuoting.value = false
    }
  }, 600)

  watch([inputAmountNano, selectedMultiplier, selectedPoolId, slippage], () => {
    if (inputAmountNano.value > 0n) {
      fetchQuotes()
    }
    else {
      resetQuoteState()
    }
  })

  async function submitLoopZap() {
    const pool = selectedPool.value
    if (!pool || !zapQuote.value || !multiplyQuote.value || !address.value) return

    isPreparing.value = true
    simulationError.value = ''

    try {
      const plan = await buildLoopZapPlan({
        inputTokenAddress: selectedInputToken.value!.address,
        inputAmount: inputAmountNano.value,
        collateralVaultAddress: pool.collateralVault,
        borrowVaultAddress: pool.borrowVault,
        debtAmount: debtAmount.value,
        zapQuote: zapQuote.value,
        multiplyQuote: multiplyQuote.value,
        includePermit2Call: false,
      })

      try {
        await simulateTxPlan(plan)
      }
      catch (simErr) {
        simulationError.value = getTxErrorMessage(simErr)
        return
      }

      modal.open(OperationReviewModal, {
        props: {
          type: 'borrow',
          asset: { symbol: pool.borrowAssetSymbol, decimals: pool.borrowAssetDecimals, address: pool.borrowAsset },
          amount: borrowAmountFormatted.value,
          plan,
          supplyingAssetForBorrow: selectedInputToken.value,
          supplyingAmount: inputAmount.value,
          onConfirm: () => {
            setTimeout(() => {
              executeLoopZap()
            }, 400)
          },
        },
      })
    }
    catch (e) {
      logWarn('loop-zap/prepare', e)
      showError('Failed to prepare transaction')
    }
    finally {
      isPreparing.value = false
    }
  }

  async function executeLoopZap() {
    const pool = selectedPool.value
    if (!pool || !zapQuote.value || !multiplyQuote.value) return

    isSubmitting.value = true

    try {
      const plan = await buildLoopZapPlan({
        inputTokenAddress: selectedInputToken.value!.address,
        inputAmount: inputAmountNano.value,
        collateralVaultAddress: pool.collateralVault,
        borrowVaultAddress: pool.borrowVault,
        debtAmount: debtAmount.value,
        zapQuote: zapQuote.value,
        multiplyQuote: multiplyQuote.value,
        includePermit2Call: true,
      })

      await executeTxPlan(plan)
      modal.close()

      refreshAllPositions(eulerLensAddresses.value, address.value || '')

      inputAmount.value = ''
      resetQuoteState()
      await updateBalance()
    }
    catch (e) {
      logWarn('loop-zap/execute', e)
      showError('Transaction failed')
    }
    finally {
      isSubmitting.value = false
    }
  }

  return {
    pools: POOLS,
    multiplierOptions: MULTIPLIER_OPTIONS,

    selectedPoolId,
    selectedPool,
    selectedMultiplier,
    inputAmount,
    inputTokenAddress,
    selectedInputToken,

    inputAmountNano,
    debtAmount,
    totalExposure,
    borrowAmountFormatted,
    totalExposureFormatted,
    walletBalance,
    expectedBptTotal,

    isQuoting,
    isPreparing,
    isSubmitting,
    quoteError,
    simulationError,
    isReady,

    submitLoopZap,
    updateBalance,
  }
}
