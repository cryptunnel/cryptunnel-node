/**
 * Response shapes of the Cryptunnel API.
 *
 * Everything that travels on the wire is derived from `generated/api.ts`, which
 * `npm run types:generate` pulls from https://cryptunnel.io/openapi. Neither file is edited by
 * hand - regenerate instead. The option objects at the bottom are this package's own ergonomics and
 * have no counterpart in the spec, so they stay hand-written.
 */
import type { components, operations } from './generated/api.js'

type JsonResponse<T extends { responses: { 200: { content: { 'application/json': unknown } } } }> =
  T['responses'][200]['content']['application/json']

type JsonBody<T extends { requestBody?: { content: { 'application/json': unknown } } }> =
  NonNullable<T['requestBody']>['content']['application/json']

type CreateWidgetBody = JsonBody<operations['Create Widget Payment']>

/**
 * A payment nobody has picked a currency for yet - created and waiting for the payer, or expired
 * before they paid. It carries no crypto amount and no wallet address.
 */
export type AwaitingCurrencyPayment = components['schemas']['AwaitingCurrencyPayment']

/**
 * A payment with a currency and a wallet assigned: the payer picked one in the widget, or you named
 * a `targetCurrency` on the h2h endpoint.
 */
export type AssignedCurrencyPayment = components['schemas']['AssignedCurrencyPayment']

/**
 * The payment as `getPayment` returns it. Narrow with `in` to reach the crypto amount:
 *
 * ```ts
 * const payment = await cryptunnel.getPayment(id)
 * if ('amount' in payment) {
 *   console.log(payment.amount, payment.currency, payment.wallet_address)
 * }
 * ```
 *
 * A negative check on `status` does not narrow: `AwaitingCurrencyPayment` holds two statuses, so
 * ruling out one of them leaves the member in place. Use `in`, or a positive `status ===` check.
 */
export type Payment = JsonResponse<operations['Get Payment Info']>

/** The payment as `createWidgetPayment` returns it, carrying the url to send the payer to. */
export type WidgetPayment = JsonResponse<operations['Create Widget Payment']>

/** The payment as `createH2hPayment` returns it, carrying the wallet address and crypto amount. */
export type H2hPayment = JsonResponse<operations['Create H2H Payment']>

export type PaymentList = JsonResponse<operations['List Payments']>

export type Merchant = JsonResponse<operations['Get Merchant Info']>

export type Currency = JsonResponse<operations['List Currencies']>[number]

/**
 * A transaction hash submitted against a failed payment and what the check made of it - the answer of
 * `appealPayment`. `status` is `confirmed`, `waiting`, `refused`, `approved` or `rejected`; a waiting
 * appeal has at least one failed line in `checks`, with `expected` and `actual` side by side.
 */
export type Appeal = components['schemas']['Appeal']

export type AppealChecks = components['schemas']['AppealChecks']

export type AppealStatus = Appeal['status']

export type AppealList = JsonResponse<operations['List Appeals']>

/** What `decideAppeal` takes: `approved`, `wrong_amount`, `too_late` or `not_this_payment`. */
export type AppealDecision = JsonBody<operations['Decide Appeal']>['decision']

/** What `decideAppeal` returns: the `outcome` and the appeal after it. */
export type AppealDecisionResult = JsonResponse<operations['Decide Appeal']>

export type PaymentStatus = Payment['status']

export type FeePayer = NonNullable<CreateWidgetBody['fee_payer']>

export type PaymentMetadata = NonNullable<CreateWidgetBody['metadata']>

export interface CreatePaymentOptions {
  amount: number
  currency: string
  externalId: string
  callbackUrl?: string
  metadata?: PaymentMetadata
  feePayer?: FeePayer
}

export interface CreateWidgetPaymentOptions extends CreatePaymentOptions {
  successUrl?: string
  failUrl?: string
}

export interface CreateH2hPaymentOptions extends CreatePaymentOptions {
  /** One of the codes `listCurrencies` returns. */
  targetCurrency: string
  autoTrace?: boolean
}

export interface WaitForPaymentOptions {
  /** Give up after this many milliseconds. Default 30 minutes. */
  timeoutMs?: number
  /** Delay before the first poll. Default 5 seconds. */
  firstDelayMs?: number
  /** Cap for the exponential backoff. Default 30 seconds. */
  maxDelayMs?: number
}
