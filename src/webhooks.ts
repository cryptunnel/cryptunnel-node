import { createHmac, timingSafeEqual } from 'node:crypto'

export const DEFAULT_TOLERANCE_SECONDS = 300

export type WebhookHeaders = Headers | Record<string, string | string[] | undefined>

/**
 * Verify a callback signed by Cryptunnel.
 *
 * `rawBody` must be the bytes as received: parsing and re-serialising the JSON changes the
 * signature. Returns false for anything that does not verify - it never throws.
 */
export function verifyWebhook(
  secret: string,
  headers: WebhookHeaders,
  rawBody: string | Buffer | Uint8Array,
  toleranceSeconds: number = DEFAULT_TOLERANCE_SECONDS,
): boolean {
  const timestamp = readHeader(headers, 'x-webhook-timestamp')
  const signature = readHeader(headers, 'x-webhook-signature')
  if (!timestamp || !signature) {
    return false
  }

  const sentAt = Number(timestamp)
  if (!Number.isFinite(sentAt) || Math.abs(Date.now() / 1000 - sentAt) > toleranceSeconds) {
    return false
  }

  const body = typeof rawBody === 'string' ? Buffer.from(rawBody) : Buffer.from(rawBody)
  const expected = createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(`${timestamp}.`), body]))
    .digest('hex')

  // timingSafeEqual throws on a length mismatch, so the length is checked first
  const sent = Buffer.from(signature)
  const digest = Buffer.from(expected)
  return sent.length === digest.length && timingSafeEqual(sent, digest)
}

function readHeader(headers: WebhookHeaders, name: string): string | undefined {
  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name) ?? undefined
  }
  const record = headers as Record<string, string | string[] | undefined>
  const value = record[name] ?? record[Object.keys(record).find(key => key.toLowerCase() === name) ?? '']
  return Array.isArray(value) ? value[0] : value
}
