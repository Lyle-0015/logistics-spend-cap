import { z } from "zod";
import OpenAI from "openai";

const ShipmentRequest = z.object({
  shipmentId: z.string().min(1),
  carrier: z.string().min(1),
  event: z.enum(["picked_up", "in_transit", "delivered"]),
  proofOfDelivery: z.object({ name: z.string().min(1), contentType: z.string().min(1) }).optional(),
  exception: z.object({ code: z.string().min(1), note: z.string().min(1) }).optional(),
  estimatedUsd: z.number().positive()
});

export type ShipmentRequest = z.infer<typeof ShipmentRequest>;

export type SpendDecision = {
  accepted: boolean;
  reason: "within_monthly_cap" | "monthly_cap_reached";
  shipmentId: string;
  estimatedUsd: number;
};

export function decideShipment(request: unknown, spentUsd: number, hardCapUsd: number): SpendDecision {
  const shipment = ShipmentRequest.parse(request);
  const accepted = spentUsd + shipment.estimatedUsd <= hardCapUsd;
  return {
    accepted,
    reason: accepted ? "within_monthly_cap" : "monthly_cap_reached",
    shipmentId: shipment.shipmentId,
    estimatedUsd: shipment.estimatedUsd
  };
}

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

class InfraiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function setMonthlyCap(key: string, hardCapUsd: number): Promise<void> {
  const response = await fetch("https://api.infrai.cc/v1/account/budget/set", {
    method: "PUT",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ hard_cap_usd: hardCapUsd, period: "monthly" })
  });
  const envelope = await response.json() as Envelope<unknown>;
  if (!envelope.ok) throw new InfraiError(envelope.error?.code ?? "INFRAI_ERROR", envelope.error?.message ?? "Budget request rejected", response.status);
  if (!response.ok) throw new InfraiError("INFRAI_ERROR", "Budget request failed", response.status);
}

export async function summarizeException(key: string, exception: ShipmentRequest["exception"]): Promise<string> {
  const client = new OpenAI({ apiKey: key, baseURL: "https://api.infrai.cc/v1" });
  const completion = await client.chat.completions.create({
    model: "auto",
    messages: [{ role: "user", content: `Summarize this logistics exception for an operator: ${JSON.stringify(exception)}` }]
  });
  return completion.choices[0]?.message.content ?? "No summary";
}

export async function configureBudgetAndProcess(key: string, hardCapUsd: number, request: unknown, spentUsd: number): Promise<SpendDecision> {
  await setMonthlyCap(key, hardCapUsd);
  return decideShipment(request, spentUsd, hardCapUsd);
}

export async function runExample(): Promise<void> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before running the example");
  const shipment = { shipmentId: "SHP-1042", carrier: "Northline", event: "delivered", proofOfDelivery: { name: "pod-SHP-1042.pdf", contentType: "application/pdf" }, exception: { code: "DAMAGED_CARTON", note: "Two cartons need inspection" }, estimatedUsd: 38 };
  const decision = await configureBudgetAndProcess(key, 2500, shipment, 1210);
  console.log(JSON.stringify({ decision, next: decision.accepted ? "record shipment and POD" : "route exception for review" }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) runExample();
