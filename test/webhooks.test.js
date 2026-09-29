import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { test } from 'node:test'

import { verifyWebhook } from '../dist/index.js'

const SECRET = 'whsec_test'
const BODY = Buffer.from('{"id":"n9cdFaTccYbXecVekHKW8Q","status":"confirmed"}')

function sign(body, timestamp, secret = SECRET) {
  const signature = createHmac('sha256', secret).update(`${timestamp}.`).update(body).digest('hex')
  return { 'x-webhook-timestamp': String(timestamp), 'x-webhook-signature': signature }
}

const now = () => Math.floor(Date.now() / 1000)

test('accepts a genuine callback', () => {
  assert.equal(verifyWebhook(SECRET, sign(BODY, now()), BODY), true)
})

test('accepts a Headers object and a string body', () => {
  const headers = new Headers(sign(BODY, now()))
  assert.equal(verifyWebhook(SECRET, headers, BODY.toString()), true)
})

test('accepts headers in any casing', () => {
  const signed = sign(BODY, now())
  const headers = { 'X-Webhook-Timestamp': signed['x-webhook-timestamp'], 'X-Webhook-Signature': signed['x-webhook-signature'] }
  assert.equal(verifyWebhook(SECRET, headers, BODY), true)
})

test('rejects a tampered body', () => {
  assert.equal(verifyWebhook(SECRET, sign(BODY, now()), Buffer.concat([BODY, Buffer.from(' ')])), false)
})

test('rejects a stale timestamp', () => {
  assert.equal(verifyWebhook(SECRET, sign(BODY, now() - 301), BODY), false)
})

test('accepts a stale timestamp within a wider tolerance', () => {
  assert.equal(verifyWebhook(SECRET, sign(BODY, now() - 301), BODY, 600), true)
})

test('rejects a signature of the wrong length without throwing', () => {
  const headers = sign(BODY, now())
  headers['x-webhook-signature'] = headers['x-webhook-signature'].slice(0, 10)
  assert.equal(verifyWebhook(SECRET, headers, BODY), false)
})

test('rejects another secret', () => {
  assert.equal(verifyWebhook(SECRET, sign(BODY, now(), 'whsec_other'), BODY), false)
})

test('rejects missing or unparsable headers', () => {
  assert.equal(verifyWebhook(SECRET, {}, BODY), false)
  const headers = sign(BODY, now())
  headers['x-webhook-timestamp'] = 'not-a-number'
  assert.equal(verifyWebhook(SECRET, headers, BODY), false)
})
