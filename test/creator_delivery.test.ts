import assert from "node:assert/strict";
import test from "node:test";
import { runCreatorDelivery, type LogsPort } from "../src/creator_delivery";

test("subscriber updates wait until processing and asset delivery are complete", async () => {
  const ingested: Parameters<LogsPort["ingest"]>[0][] = [];
  const logs = {
    ingest: async (input: Parameters<LogsPort["ingest"]>[0]) => {
      ingested.push(input);
      return {};
    },
    search: async () => ({}),
  } satisfies LogsPort;

  const decision = await runCreatorDelivery({
    jobId: "job-42",
    creatorId: "creator-7",
    assetId: "asset-9",
    processing: "complete",
    assetReady: false,
    subscriberCount: 320,
  }, logs);

  assert.deepEqual(decision, { outcome: "processing_pending", subscribersUpdated: 0 });
  assert.equal(ingested[0]?.idempotency_key, "creator-delivery:job-42");
  assert.equal(ingested[0]?.entries[0]?.trace_id, "job-42");
  assert.equal(ingested[0]?.entries[0]?.metadata.subscribers_updated, 0);
});
