import { createRequire } from 'node:module'
import type {
  CreateH2hPaymentOptions,
  CreateWidgetPaymentOptions,
  Currency,
  H2hPayment,
  Merchant,
  Payment,
  PaymentList,
  PaymentStatus,
  WaitForPaymentOptions,
  WidgetPayment,
} from './types.js'
import { ApiError, errorFromResponse, PaymentTimeoutError, RateLimitError } from './errors.js'

export const DEFAULT_BASE_URL = 'https://api.cryptunnel.io'
export const DEFAULT_TIMEOUT_MS = 30_000

const { version } = createRequire(import.meta.url)('../package.json') as { version: string }

/**
 * The User-Agent every request carries: package, Node and platform, plus your `app` if given.
 * Cryptunnel uses it to see which SDK versions merchants integrate with. Nothing identifying is
 * included - no hostname, no paths.
 */
export function userAgent(app?: string): string {
  const base = `cryptunnel-node/${version} node/${process.versions.node} (${process.platform} ${process.arch})`
  return app ? `${base} ${app}` : base
}

/** Statuses a payment never leaves. */
export const TERMINAL_STATUSES: readonly PaymentStatus[] = ['confirmed', 'confirmed_manual', 'failed', 'expired']

export interface CryptunnelOptions {
  merchantId: string
  apiKey: string
  /** Mark every created payment as a test payment and list the testnet currencies. */
  sandbox?: boolean
  baseUrl?: string
  timeoutMs?: number
  /** Your application, appended to the User-Agent, e.g. `my-shop/2.0`. */
  app?: string
}

/**
 * The Cryptunnel API client.
 *
 * ```ts
 * const cryptunnel = new Cryptunnel({ merchantId, apiKey, sandbox: true })
 * const payment = await cryptunnel.createWidgetPayment({ amount: 10, currency: 'USD', externalId: 'order-1' })
 * ```
 */
export class Cryptunnel {
  readonly sandbox: boolean
  readonly baseUrl: string
  private readonly headers: Record<string, string>
  private readonly timeoutMs: number

  constructor(options: CryptunnelOptions) {
    this.sandbox = options.sandbox ?? false
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.headers = {
      'content-type': 'application/json',
      'user-agent': userAgent(options.app),
      'x-merchant-id': options.merchantId,
      'x-api-key': options.apiKey,
    }
  }

  /** Create a payment and get the widget url to send the payer to. */
  createWidgetPayment(options: CreateWidgetPaymentOptions): Promise<WidgetPayment> {
    return this.request('POST', '/v1/payments/widget', {
      body: {
        ...this.paymentBody(options),
        success_url: options.successUrl,
        fail_url: options.failUrl,
      },
    })
  }

  /** Create a payment and get the wallet address and crypto amount to show yourself. */
  createH2hPayment(options: CreateH2hPaymentOptions): Promise<H2hPayment> {
    return this.request('POST', '/v1/payments/h2h', {
      body: {
        ...this.paymentBody(options),
        target_currency: options.targetCurrency,
        auto_trace: options.autoTrace ?? false,
      },
    })
  }

  /** Read one payment by its Cryptunnel id. */
  getPayment(paymentId: string): Promise<Payment> {
    return this.request('GET', `/v1/payments/${encodeURIComponent(paymentId)}`)
  }

  /** List your payments, newest first. */
  listPayments(options: { limit?: number, offset?: number } = {}): Promise<PaymentList> {
    return this.request('GET', '/v1/payments', {
      query: { limit: String(options.limit ?? 20), offset: String(options.offset ?? 0) },
    })
  }

  /** List the currencies you can receive - exactly the values `targetCurrency` accepts. */
  listCurrencies(): Promise<Currency[]> {
    return this.request('GET', '/v1/currencies', { query: { is_test: String(this.sandbox) } })
  }

  /** Read your merchant - the call that tells you the credentials work. */
  getMerchant(): Promise<Merchant> {
    return this.request('GET', '/v1/merchants')
  }

  /**
   * Poll until the payment reaches a terminal status.
   *
   * For scripts and development. In production the webhook is the guarantee: a buyer who closes the
   * page still produces a callback, a polling process that dies does not.
   */
  async waitForPayment(paymentId: string, options: WaitForPaymentOptions = {}): Promise<Payment> {
    const timeoutMs = options.timeoutMs ?? 30 * 60_000
    const maxDelayMs = options.maxDelayMs ?? 30_000
    const deadline = Date.now() + timeoutMs
    let backoffMs = options.firstDelayMs ?? 5_000

    // The API sends Retry-After on a 429, but the backoff has to stand on its own if it ever stops
    const nextDelay = (retryAfterSeconds?: number) => {
      const delay = retryAfterSeconds === undefined ? backoffMs : retryAfterSeconds * 1000
      backoffMs = Math.min(backoffMs * 2, maxDelayMs)
      return Math.max(0, Math.min(delay, deadline - Date.now()))
    }

    let delay = nextDelay()
    while (true) {
      await sleep(delay)
      if (Date.now() >= deadline) {
        throw new PaymentTimeoutError(`Payment ${paymentId} did not settle within ${timeoutMs}ms`)
      }
      let payment: Payment
      try {
        payment = await this.getPayment(paymentId)
      } catch (error) {
        if (!(error instanceof RateLimitError)) {
          throw error
        }
        delay = nextDelay(error.retryAfter)
        continue
      }
      if (TERMINAL_STATUSES.includes(payment.status)) {
        return payment
      }
      delay = nextDelay()
    }
  }

  private paymentBody(options: CreateWidgetPaymentOptions | CreateH2hPaymentOptions) {
    return {
      amount: options.amount,
      currency: options.currency,
      external_id: options.externalId,
      is_test: this.sandbox,
      callback_url: options.callbackUrl,
      metadata: options.metadata,
      fee_payer: options.feePayer,
    }
  }

  private async request<T>(
    method: string,
    path: string,
    options: { body?: Record<string, unknown>, query?: Record<string, string> } = {},
  ): Promise<T> {
    const url = new URL(this.baseUrl + path)
    for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, value)
    }

    let response: Response
    try {
      response = await fetch(url, {
        method,
        headers: this.headers,
        body: options.body ? JSON.stringify(withoutUndefined(options.body)) : undefined,
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (error) {
      throw new ApiError(`Request to ${path} failed: ${(error as Error).message}`)
    }

    const payload = await response.json().catch(() => undefined)
    if (!response.ok) {
      throw errorFromResponse(response.status, payload, retryAfter(response.headers))
    }
    return payload as T
  }
}

function retryAfter(headers: Headers): number | undefined {
  const value = Number(headers.get('retry-after'))
  return Number.isFinite(value) && headers.has('retry-after') ? value : undefined
}

function withoutUndefined(body: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined))
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
