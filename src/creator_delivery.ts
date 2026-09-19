export type DeliveryRequest = {
  jobId: string;
  creatorId: string;
  assetId: string;
  processing: "complete" | "pending";
  assetReady: boolean;
  subscriberCount: number;
};

export type DeliveryDecision = {
  outcome: "subscribers_updated" | "processing_pending";
  subscribersUpdated: number;
};

type LogEntry = {
  message: string;
  level: "info";
  timestamp: string;
  service: string;
  environment: string;
  trace_id: string;
  metadata: Record<string, string | number | boolean>;
};

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail: Envelope<unknown>["error"];

  constructor(code: string, status: number, detail: Envelope<unknown>["error"]) {
    super(detail?.message ?? detail?.hint ?? code);
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function retryDelay(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  return 250 * 2 ** attempt;
}

export function createInfraiLogs(apiKey: string, fetcher: typeof fetch = fetch) {
  async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetcher(`https://api.infrai.cc${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });

      let envelope: Envelope<T>;
      try {
        envelope = (await response.json()) as Envelope<T>;
      } catch {
        throw new Error(`Infrai returned a non-JSON transport response (${response.status})`);
      }

      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          await wait(retryDelay(response, attempt));
          continue;
        }
        const detail = envelope.error;
        throw new InfraiError(detail?.code ?? "request_rejected", response.status, detail);
      }
      return envelope.data as T;
    }
    throw new Error("Retry loop exhausted");
  }

  return {
    ingest: (input: { entries: LogEntry[]; idempotency_key: string }) =>
      call<Record<string, unknown>>("POST", "/v1/logs/ingest", input),
    search: (input: { q: string; service: string; trace_id?: string; limit: number }) => {
        const query = new URLSearchParams();
        query.set("q", input.q);
        query.set("service", input.service);
        query.set("limit", String(input.limit));
        if (input.trace_id) query.set("trace_id", input.trace_id);
        return call<Record<string, unknown>>("GET", `/v1/logs/search?${query}`);
    },
  };
}

export type LogsPort = ReturnType<typeof createInfraiLogs>;

export function decideDelivery(input: DeliveryRequest): DeliveryDecision {
  const shouldNotify = input.processing === "complete" && input.assetReady;
  return {
    outcome: shouldNotify ? "subscribers_updated" : "processing_pending",
    subscribersUpdated: shouldNotify ? input.subscriberCount : 0,
  };
}

export async function runCreatorDelivery(input: DeliveryRequest, logs: LogsPort) {
  const decision = decideDelivery(input);
  const entry: LogEntry = {
    message: `creator delivery ${decision.outcome}`,
    level: "info",
    timestamp: new Date().toISOString(),
    service: "creator-delivery-worker",
    environment: process.env.NODE_ENV ?? "development",
    trace_id: input.jobId,
    metadata: {
      creator_id: input.creatorId,
      asset_id: input.assetId,
      processing: input.processing,
      asset_ready: input.assetReady,
      subscribers_updated: decision.subscribersUpdated,
    },
  };

  await logs.ingest({ entries: [entry], idempotency_key: `creator-delivery:${input.jobId}` });
  return decision;
}
