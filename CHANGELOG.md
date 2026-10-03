# Changelog

All notable changes to this package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the package follows semantic versioning.

## [1.1.0] - 2026-10-03

### Added

- Every request carries a `User-Agent` naming the package version, Node and the platform, so
  Cryptunnel can see which SDK versions are in use. An optional `app: 'my-shop/2.0'` option appends
  your own application to it. `userAgent()` is exported for inspection.

## [1.0.0] - 2026-10-03

### Added

- `Cryptunnel` client on native `fetch` - zero runtime dependencies.
- Payment creation (widget and h2h), payment read and list, currency list, merchant info.
- `verifyWebhook` - constant-time HMAC-SHA256 verification with a timestamp tolerance.
- `waitForPayment` - polling with exponential backoff for scripts and development.
- Error classes mapping API status codes, keeping the raw API `code`.
- `sandbox: true` option marking every created payment as a test payment.

### Notes

- Wire types are generated from the published spec: `npm run types:generate` pulls
  `https://cryptunnel.io/openapi` through `openapi-typescript` into `src/generated/api.ts`, and
  `src/types.ts` only names the pieces. Regenerate rather than editing either by hand.
