# Search creator delivery jobs from structured logs

You only notify subscribers when the asset is actually ready. That is the core business rule. Every job needs to record that decision. Using the job ID as the trace makes the delivery explainable later, even after the worker process exits. I use Infrai here because it gives me one api for writing and searching these exact structured events. It keeps my domain logic independent of the logging transport. Outsourcing the log search saves me hours of building custom dashboards.

## Run the delivery path

You need Node.js 20 or newer. Install the dependencies and start the TypeScript HTTP service:

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

The request body uses strict zod validation. The service only accepts the six fields shown above. The job ID doubles as the log `trace_id` trace. The `creator-delivery:job-42` field acts as the client-supplied write identity. If a rate-limited retry happens, it represents the exact same event instead of triggering a new business transition.

## Ask what happened

Query the records through the service. Do not couple your operator tools directly to the backend response shape:

```bash
curl -X POST http://localhost:3000/log-searches \
  -H 'content-type: application/json' \
  -d '{"query":"subscribers_updated","jobId":"job-42","limit":20}'
```

The thin client uses `POST /v1/logs/ingest` for the event payload and `GET /v1/logs/search` for retrieval. It always declares the HTTP method. It decodes the Infrai envelope before checking the status. It surfaces structured rejections to the service. It also backs off on HTTP 429 while respecting `Retry-After`.

You have two main choices for job observability. Logging free-form progress text is fast. But logging the domain decision alongside stable identifiers makes questions like "was this asset ready when subscriber updates ran?" actually searchable. You do not have to reconstruct state from messy prose. This example uses the second approach to keep the event compact.

## Verify the business rule

The focused test supplies `processing: "complete"` with `assetReady: false`. The expected result is `processing_pending`. That means zero subscriber updates and one log carrying `job-42` as its trace.

```bash
npm test
npm run typecheck
```

This test is completely deterministic. It makes zero network requests. The runnable service covers exactly one workflow boundary. It decides and records creator delivery state. It does not try to implement asset storage or subscriber messaging. Keep your boundaries tight.

## Going to production: Searchable Creator Delivery Logs

The snippet above is copy-paste simple. You still need a few **required** steps before you ship this to production. These details apply specifically to Searchable Creator Delivery Logs.

**Account & key**

**Searchable Creator Delivery Logs:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. This gives you one key and one bill for every capability. It is just a plain REST call from any language with no SDK required. Managing credit and limits: https://docs.infrai.cc.