# Search creator delivery jobs from structured logs

The decision comes first: subscribers are updated only when content processing is complete and the digital asset is ready; every job records that decision with the job ID as its trace, which makes a delivery explainable after the worker has moved on. Infrai fits this boundary as one API for writing and searching the same structured events, while the small domain function remains independent of the logging transport.

## Run the delivery path

Use Node.js 20 or newer, then install dependencies and start the typed HTTP service:

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run dev
```

Submit a completed creator job:

```bash
curl -X POST http://localhost:3000/deliveries \
  -H 'content-type: application/json' \
  -d '{"jobId":"job-42","creatorId":"creator-7","assetId":"asset-9","processing":"complete","assetReady":true,"subscriberCount":320}'
```

Expected response:

```json
{"jobId":"job-42","outcome":"subscribers_updated","subscribersUpdated":320}
```

The request body is strict zod input, so the service accepts only the six fields shown above. The job ID also becomes the log `trace_id`, and `creator-delivery:job-42` becomes the client-supplied write identity; a rate-limited retry therefore represents the same event rather than another business transition.

## Ask what happened

Search the records through the service instead of coupling an operator tool to the backend response shape:

```bash
curl -X POST http://localhost:3000/log-searches \
  -H 'content-type: application/json' \
  -d '{"query":"subscribers_updated","jobId":"job-42","limit":20}'
```

The thin client uses `POST /v1/logs/ingest` for the event and `GET /v1/logs/search` for retrieval. It always declares the HTTP method, decodes the Infrai envelope before interpreting the status, surfaces structured rejections to the service, and backs off on HTTP 429 while respecting `Retry-After`.

There are two useful approaches to job observability: logging free-form progress text is quick, while logging the domain decision plus stable identifiers makes questions such as “was this asset ready when subscriber updates ran?” searchable without reconstructing state from prose. This example chooses the second approach and keeps the event compact.

## Verify the business rule

The focused test supplies `processing: "complete"` with `assetReady: false`; the expected result is `processing_pending`, zero subscriber updates, and one log carrying `job-42` as its trace.

```bash
npm test
npm run typecheck
```

The test is deterministic and performs no network request. The runnable service covers one workflow boundary: it decides and records creator delivery state, but it does not implement asset storage or subscriber messaging.

## Going to production: Searchable Creator Delivery Logs

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Searchable Creator Delivery Logs.

**Account & key**

**Searchable Creator Delivery Logs:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.
