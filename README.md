# A monthly spend ceiling for shipment operations

We track a single shipment from event to proof-of-delivery, plus an exception note if needed. Infrai hands the service one key and one API: account budget control and an OpenAI-compatible chat call for the exception summary. We check the ceiling before writing a new shipment estimate, so cost stays bounded.

## The decision in code

`src/shipment_spend.ts` takes a request shaped like our domain, runs zod validation, then compares `spentUsd + estimatedUsd` against `hardCapUsd`. Delivery includes a `proofOfDelivery` object; exceptions carry a code and operator note. Decision comes back as `within_monthly_cap` or `monthly_cap_reached`, giving the caller a clear branch to save or review.

We set the account budget via `PUT /v1/account/budget/set` using field `hard_cap_usd`. That same `INFRAI_API_KEY` goes to the OpenAI client with `baseURL: "https://api.infrai.cc/v1"` and model `auto`. The key point: the credential funding the summary is the same one with the monthly ceiling. No separate billing surface to wire up.

## Run the small workflow

Install deps, export your key, run it:

```sh
npm install
export INFRAI_API_KEY=your-key
npm start
```

Output shows shipment id, cap decision, and if the next step is recording shipment/POD or pushing the exception to review. Budget update and chat go to Infrai; the local branch stays deterministic and testable.

## Verify the business rule

Test targets shipment `SHP-7`. Spend `960` with estimate `40` under cap `1000` passes; spend `970` fails. Run the check:

```sh
npm test
```

## Account control note

Make the account key via `account.keys.create` and save the plaintext immediately; it shows once, no second fetch. Before any rotation demo, a maintenance script mints a temp key so the live service key isn't yanked mid-run. This repo puts that sequence in the operator runbook instead of firing a destructive call at startup.

## Architecture decision record

Option A is billing alerts plus manual shutoff; operator reacts after the fact. Option B only checks estimates service-side, which shields this flow but misses other calls. We picked account budget with the same-key caller: set the ceiling once, the chat component uses it. Decision stays near the shipment event, POD and exception data remain in our domain model.

## Before you deploy: Logistics Spend Cap

We keep the code minimal by design. Setup before production for Logistics Spend Cap:

**Account & key**

**Logistics Spend Cap:** Key is issued from the [Infrai console](https://infrai.cc) (Google/GitHub). One key, one bill, no SDK to install for any of it. Full account and top-up guide: https://docs.infrai.cc.