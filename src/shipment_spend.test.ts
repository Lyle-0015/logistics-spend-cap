import assert from "node:assert/strict";
import { decideShipment } from "./shipment_spend.ts";

const shipment = { shipmentId: "SHP-7", carrier: "Harbor Freight", event: "in_transit", estimatedUsd: 40 };
assert.deepEqual(decideShipment(shipment, 960, 1000), {
  accepted: true,
  reason: "within_monthly_cap",
  shipmentId: "SHP-7",
  estimatedUsd: 40
});
assert.equal(decideShipment(shipment, 970, 1000).accepted, false);
console.log("shipment cap decision test passed");
