# Third-Party Agent Billing Monitor Design

## Goal

Provide an admin monitoring module for MCP calls made by external agents with an ArtX API key. The module must show per-key usage, credits, tokens, reliability, and estimated upstream cost in Hong Kong dollars.

## Scope

- Record a non-secret API key identifier, optional agent source, MCP method/tool, model, capability, result status, latency, output count, token usage, charged credits, estimated USD cost, and event timestamp.
- Aggregate calls by API key and declared agent source for the selected time range.
- Expose an authenticated admin API for summaries and paginated details.
- Add a third-party call monitor view to the admin client with time filters, totals, trend data, model distribution, key/agent ranking, and recent calls.
- Store the USD estimate as the immutable raw cost and convert it for display using the configured USD/HKD rate.

## Non-Goals

- Do not expose full ArtX API keys, prompts, generated image URLs, or user session tokens in monitoring data.
- Do not label estimated costs as provider invoices or actual supplier charges.
- Do not retroactively invent missing per-key data for calls recorded before the feature is deployed.

## Data Model

Add an external-agent usage event to admin data. Each event stores the API key record ID and masked prefix, optional source label, MCP method/tool, model and capability, status, latency, output count, provider token counts when available, charged credits, estimated USD cost, and ISO timestamp.

The billing configuration gains `usdToHkdRate` with a default of `7.8`. Admin responses return both immutable USD totals and HKD display totals. Existing capability estimates remain the source of the USD amount; only their presentation is converted.

## Request Flow

1. MCP authenticates the external ArtX API key and receives its key ID and prefix.
2. MCP accepts an optional agent source during `initialize`; the server limits and normalizes it before associating it with the connection/request.
3. Every successful or failed `tools/call` creates a usage event after the existing AI usage ledger is recorded.
4. The admin monitor queries events with time, key, source, model, and status filters.
5. The client presents all monetary figures as `预估 HK$`; the configured exchange rate and last update are visible with the totals.

## Admin Experience

The admin sidebar gets a `第三方调用` entry. Its view has a compact operational layout:

- Time range and key/source/model/status filters.
- Totals for successful calls, charged credits, input/output tokens, estimated HK$ cost, and failure rate.
- Call trend and model distribution.
- A per-key/per-agent table showing masked key, source, model, calls, credits, tokens, estimated HK$, failures, and last-call time.
- A recent-call table for investigating failures without disclosing request content.

## Error Handling And Retention

The monitor records failed MCP tool calls with the sanitized failure category. If upstream token usage is not supplied, the token fields stay empty rather than being estimated. Event writes must not change MCP response behavior; a monitoring write failure is logged server-side and does not mask a completed tool result.

## Verification

- Unit tests prove API key identity and source labels are captured without key secrets.
- Tests cover successful calls, failed calls, missing token usage, HKD conversion, and filter/aggregate correctness.
- Admin API authorization is tested for non-admin rejection.
- Client tests verify the monitor view labels estimated HK$ cost and masks API keys.
