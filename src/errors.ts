/** Errors thrown by the client - branch on the class, read the API code from `code`. */
export class CryptunnelError extends Error {
  /** The raw API code, e.g. PAYMENT_ALREADY_EXISTS, CURRENCY_NOT_FOUND, WALLET_NOT_FOUND. */
  code?: string
  status?: number

  constructor(message: string, options: { code?: string, status?: number } = {}) {
    super(message)
    this.name = new.target.name
    this.code = options.code
    this.status = options.status
  }
}

/** 401: wrong merchant id, wrong or rotated key, or a suspended merchant. */
export class AuthenticationError extends CryptunnelError {}

/** 404: the payment or currency does not exist for this merchant. */
export class NotFoundError extends CryptunnelError {}

/** 400: the request was rejected, see `code` for which rule. */
export class ValidationError extends CryptunnelError {}

/** 429: too many requests. `retryAfter` is undefined when the API sends no header. */
export class RateLimitError extends CryptunnelError {
  retryAfter?: number

  constructor(message: string, options: { code?: string, status?: number, retryAfter?: number } = {}) {
    super(message, options)
    this.retryAfter = options.retryAfter
  }
}

/** A server-side failure or a transport error. */
export class ApiError extends CryptunnelError {}

/** `waitForPayment` gave up before the payment reached a terminal status. */
export class PaymentTimeoutError extends CryptunnelError {}

export function errorFromResponse(status: number, payload: unknown, retryAfter?: number): CryptunnelError {
  const body = (payload && typeof payload === 'object' ? payload : {}) as { code?: string, message?: string }
  const options = { code: body.code, status }
  const message = body.message || `Cryptunnel API returned ${status}`

  switch (status) {
    case 401:
      return new AuthenticationError(message, options)
    case 404:
      return new NotFoundError(message, options)
    case 429:
      return new RateLimitError(message, { ...options, retryAfter })
    case 400:
      return new ValidationError(message, options)
    default:
      return new ApiError(message, options)
  }
}
