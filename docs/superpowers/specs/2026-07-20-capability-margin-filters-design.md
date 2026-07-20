# Capability Margin Filters Design

## Goal

Make capability-margin records searchable without client-side truncation by applying one server-side filter set to task details, capability aggregates, model drilldown, and KPI totals.

## Filters

- Time ranges: 1 day, 3 days, 7 days, 15 days, 1 month, 3 months, and 6 months.
- Gross-margin bands: negative, 0-30%, 30-60%, 60% and above; optional numeric lower/upper limits.
- Exact model ID.
- Case-insensitive user-account search across account email and username.
- Charged-credit minimum and maximum.

## Output

The filtered response returns task details with exact timestamps plus capability and model aggregates computed from the same task set. Each task row contains user account, model, capability, actual charged credits, estimated cost snapshot, gross margin, status, and timestamp.

## Rules

Successful tasks drive revenue, cost, and margin totals. Failed tasks remain in the detail list and failure counts but contribute zero revenue/cost. Missing filters do not constrain results. A time boundary is inclusive and evaluated in server time.

## Verification

Tests cover every time range, combinations of account/model/credit/margin filters, matching aggregate totals, and client filter labels.
