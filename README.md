# cryptunnel

Node SDK for [Cryptunnel](https://cryptunnel.io) - accept crypto payments straight into your own
wallets. Zero runtime dependencies: native `fetch` and `node:crypto`.

```bash
npm install cryptunnel
```

Node 20+. TypeScript types are bundled.

## Create a sandbox payment

```ts
import { Cryptunnel } from 'cryptunnel'

const cryptunnel = new Cryptunnel({
  merchantId: '<merchant id>',
  apiKey: '<api key>',
  sandbox: true,
})

console.log(await cryptunnel.getMerchant()) // your credentials work if this prints your merchant

const payment = await cryptunnel.createWidgetPayment({
  amount: 10,
  currency: 'USD',
  externalId: 'order-1',
  successUrl: 'https://example.com/thanks',
})
console.log(payment.url) // send the buyer here
```

`sandbox: true` sets `is_test` on every payment it creates: the payer is offered testnet currencies
only, and the payment is excluded from your stats and fees. It is the same host and the same key -
the sandbox is a flag, not a second account.

## Verify a webhook

```ts
import express from 'express'
import { verifyWebhook } from 'cryptunnel'

const app = express()
const WEBHOOK_SECRET = '<whsec_...>'

// express.raw keeps the exact bytes: parsing and re-serialising the JSON changes the signature
app.post('/cryptunnel', express.raw({ type: 'application/json' }), (req, res) => {
  if (!verifyWebhook(WEBHOOK_SECRET, req.headers, req.body)) {
    return res.sendStatus(401)
  }
  const payment = JSON.parse(req.body.toString())
  if (payment.status === 'confirmed' || payment.status === 'confirmed_manual') {
    deliver(payment.external_id) // deduplicate on (id, status): retries repeat the same pair
  }
  res.sendStatus(200)
})
```

A failed delivery is retried 60 times, once a minute, for one hour, each attempt re-signed with a
fresh timestamp over the same body.

## The whole surface

| Method | Call |
| --- | --- |
| `createWidgetPayment({ amount, currency, externalId, ... })` | `POST /v1/payments/widget` |
| `createH2hPayment({ amount, currency, externalId, targetCurrency, ... })` | `POST /v1/payments/h2h` |
| `getPayment(paymentId)` | `GET /v1/payments/{id}` |
| `listPayments({ limit, offset })` | `GET /v1/payments` |
| `listCurrencies()` | `GET /v1/currencies` |
| `getMerchant()` | `GET /v1/merchants` |
| `verifyWebhook(secret, headers, rawBody)` | local, no request |
| `waitForPayment(paymentId)` | polls `GET /v1/payments/{id}` |

Payment creation is idempotent on `externalId`: a retry after a network timeout returns the payment
you already created instead of a second one. Repeating an `externalId` with a different amount or
currency is rejected with `PAYMENT_ALREADY_EXISTS`.

`getPayment` returns a union: `created` and `expired` payments carry no crypto amount and no wallet
address, because nobody has picked a currency for them yet. Narrow with `in` and TypeScript hands
you the rest:

```ts
const payment = await cryptunnel.getPayment(id)
if ('amount' in payment) {
  console.log(payment.amount, payment.currency, payment.wallet_address)
}
```

A negative check (`payment.status !== 'created' && payment.status !== 'expired'`) does not narrow -
one member holds both of those statuses, so ruling out one leaves it in place. Use `in`, or a
positive `status ===` check.

`waitForPayment` is for scripts and development - it polls every 5 seconds, backing off to 30, and
throws `PaymentTimeoutError` after 30 minutes. In production the webhook is the guarantee: a buyer
who closes the page still produces a callback.

## Telegram bots

Set `successUrl` to a deep link back into your bot and confirm with one `getPayment` call:

```ts
const payment = await cryptunnel.createWidgetPayment({
  amount: 10,
  currency: 'USD',
  externalId: orderId,
  successUrl: `https://t.me/my_shop_bot?start=paid_${orderId}`,
})
```

The webhook stays the fallback for buyers who pay and never come back.

## Errors

```ts
import { AuthenticationError, RateLimitError, ValidationError } from 'cryptunnel'

try {
  await cryptunnel.createH2hPayment({ amount: 10, currency: 'USD', externalId: 'order-3', targetCurrency: 'DOGE' })
} catch (error) {
  if (error instanceof ValidationError) {
    console.log(error.code) // WALLET_NOT_FOUND - you have no active DOGE wallet
  } else if (error instanceof RateLimitError) {
    console.log(error.retryAfter) // seconds to wait; undefined when the API sends no Retry-After header
  } else if (error instanceof AuthenticationError) {
    console.log('check the merchant id and the api key')
  }
}
```

`CryptunnelError` is the base; `AuthenticationError` (401), `NotFoundError` (404),
`ValidationError` (400), `RateLimitError` (429) and `ApiError` (5xx and transport failures) extend
it. The raw API `code` is always on the error.

## Links

- [Quickstart](https://docs.cryptunnel.io/docs/quickstart) - registration to first payment
- [Sandbox and faucets](https://docs.cryptunnel.io/docs/sandbox) - test coins without spending any
- [API reference](https://docs.cryptunnel.io)
- Support: [GitHub Issues](https://github.com/cryptunnel/cryptunnel-node/issues)

MIT licensed.
