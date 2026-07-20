# Capability Margin Dashboard Design

## Goal

Add an admin dashboard that shows which AI capabilities consume user credits, what they cost, and their gross margin so pricing can be adjusted from actual usage rather than membership-plan price.

## Data Basis

Use successful `AiTaskRecord` entries only. Each entry already contains capability, charged credits, estimated cost, output units, model, provider, and a cost snapshot created when the task was recorded. Failed tasks count only toward reliability metrics and never revenue or margin.

## Metrics

For every capability and selected time range, calculate call count, successful output units, charged-credit revenue, estimated upstream cost, gross-profit credits, gross-margin rate, average credits per call, average cost per call, cost share, and failure rate. The dashboard treats credits as the platform's revenue unit and labels the upstream amount as estimated cost.

## Experience

Add a `能力毛利` admin section with 7/30-day and all-time filters, summary KPIs, a capability ranking table, and model-level detail after selecting a capability. Rank low-margin high-volume capabilities first, then allow sorting by cost, calls, or margin.

## Scope Limits

Historical values use recorded snapshots and are not rewritten when cost policy changes. The view does not infer payment-plan revenue or claim supplier invoices are exact.

## Verification

Tests cover successful/failed task separation, cost/margin calculations, time filters, capability-to-model drilldown, and client labels that distinguish estimated cost from gross margin.
