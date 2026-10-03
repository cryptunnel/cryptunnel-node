import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import {
  ApiError,
  AuthenticationError,
  Cryptunnel,
  NotFoundError,
  RateLimitError,
  ValidationError,
  userAgent,
} from '../dist/index.js'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

function stubFetch(status, payload, headers = {}) {
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: new URL(url), init })
    return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json', ...headers } })
  }
  return calls
}

const sandboxClient = () => new Cryptunnel({ merchantId: 'merchant-id', apiKey: 'ct_live_key', sandbox: true })

test('sandbox marks creates as test payments', async () => {
  const calls = stubFetch(200, { id: 'pay-1', url: 'https://pay.cryptunnel.io/pay-1' })

  const payment = await sandboxClient().createWidgetPayment({
    amount: 10,
    currency: 'USD',
    externalId: 'order-1',
    successUrl: 'https://example.com/ok',
  })

  assert.equal(payment.url, 'https://pay.cryptunnel.io/pay-1')
  const body = JSON.parse(calls[0].init.body)
  assert.equal(body.is_test, true)
  assert.equal(body.success_url, 'https://example.com/ok')
  assert.equal('fail_url' in body, false)
  assert.equal(calls[0].init.headers['x-merchant-id'], 'merchant-id')
})

test('sandbox asks for the testnet currency family', async () => {
  const calls = stubFetch(200, [])

  await sandboxClient().listCurrencies()

  assert.equal(calls[0].url.searchParams.get('is_test'), 'true')
  assert.equal(calls[0].url.pathname, '/v1/currencies')
})

test('h2h sends the target currency', async () => {
  const calls = stubFetch(200, { id: 'pay-1' })

  await sandboxClient().createH2hPayment({ amount: 10, currency: 'USD', externalId: 'order-1', targetCurrency: 'USDT' })

  assert.equal(JSON.parse(calls[0].init.body).target_currency, 'USDT')
  assert.equal(calls[0].url.pathname, '/v1/payments/h2h')
})

test('list payments defaults to the first page', async () => {
  const calls = stubFetch(200, { items: [], total: 0, limit: 20, offset: 0 })

  await sandboxClient().listPayments()

  assert.equal(calls[0].url.searchParams.get('limit'), '20')
  assert.equal(calls[0].url.searchParams.get('offset'), '0')
})

test('each error status maps to its class', async () => {
  for (const [status, expected] of [[400, ValidationError], [401, AuthenticationError], [404, NotFoundError], [500, ApiError]]) {
    stubFetch(status, { code: 'WALLET_NOT_FOUND', message: 'Wallet not found' })
    await assert.rejects(() => sandboxClient().getMerchant(), (error) => {
      assert.ok(error instanceof expected, `${status} should map to ${expected.name}`)
      assert.equal(error.code, 'WALLET_NOT_FOUND')
      assert.equal(error.status, status)
      return true
    })
  }
})

test('429 carries retryAfter when the header is there', async () => {
  stubFetch(429, { code: 'TOO_MANY' }, { 'retry-after': '12' })

  await assert.rejects(() => sandboxClient().getMerchant(), (error) => {
    assert.ok(error instanceof RateLimitError)
    assert.equal(error.retryAfter, 12)
    return true
  })
})

test('429 without a header leaves retryAfter unset', async () => {
  stubFetch(429, { code: 'TOO_MANY' })

  await assert.rejects(() => sandboxClient().getMerchant(), (error) => {
    assert.equal(error.retryAfter, undefined)
    return true
  })
})

test('transport failures surface as api errors', async () => {
  globalThis.fetch = async () => {
    throw new TypeError('fetch failed')
  }

  await assert.rejects(() => sandboxClient().getMerchant(), ApiError)
})

test('baseUrl is honoured', async () => {
  const calls = stubFetch(200, {})
  const local = new Cryptunnel({ merchantId: 'm', apiKey: 'k', baseUrl: 'http://localhost:3000/' })

  await local.getMerchant()

  assert.equal(calls[0].url.origin, 'http://localhost:3000')
})

test('requests carry the sdk user agent', async () => {
  const calls = stubFetch(200, {})

  await sandboxClient().getMerchant()

  assert.match(calls[0].init.headers['user-agent'], /^cryptunnel-node\/\d+\.\d+\.\d+\S* node\/\S+ \(\S+ \S+\)$/)
})

test('the app name is appended to the user agent', async () => {
  const calls = stubFetch(200, {})
  const client = new Cryptunnel({ merchantId: 'm', apiKey: 'k', app: 'my-shop/2.0' })

  await client.getMerchant()

  assert.ok(calls[0].init.headers['user-agent'].endsWith(' my-shop/2.0'))
  assert.ok(userAgent().startsWith('cryptunnel-node/1.1.0 '))
})
