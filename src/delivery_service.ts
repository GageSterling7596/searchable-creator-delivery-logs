import { createServer, type ServerResponse } from "node:http";
import { z } from "zod";
import { createInfraiLogs, InfraiError, runCreatorDelivery } from "./creator_delivery";

const deliveryBody = z.object({
  jobId: z.string().min(1),
  creatorId: z.string().min(1),
  assetId: z.string().min(1),
  processing: z.enum(["complete", "pending"]),
  assetReady: z.boolean(),
  subscriberCount: z.number().int().nonnegative(),
}).strict();

const searchBody = z.object({
  query: z.string().min(1),
  jobId: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).default(20),
}).strict();

function json(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

async function readJson(request: AsyncIterable<Uint8Array>) {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");
const logs = createInfraiLogs(apiKey);

const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/deliveries") {
      const input = deliveryBody.parse(await readJson(request));
      const decision = await runCreatorDelivery(input, logs);
      return json(response, 200, { jobId: input.jobId, ...decision });
    }
    if (request.method === "POST" && request.url === "/log-searches") {
      const input = searchBody.parse(await readJson(request));
      const result = await logs.search({
        q: input.query,
        service: "creator-delivery-worker",
        trace_id: input.jobId,
        limit: input.limit,
      });
      return json(response, 200, result);
    }
    return json(response, 404, { error: "route_not_found" });
  } catch (error) {
    if (error instanceof z.ZodError) return json(response, 400, { error: "invalid_request", issues: error.issues });
    if (error instanceof SyntaxError) return json(response, 400, { error: "invalid_json" });
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      return json(response, status, { error: error.code, message: error.message });
    }
    console.error(error);
    return json(response, 500, { error: "service_error" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`creator delivery service listening on http://localhost:${port}`));
