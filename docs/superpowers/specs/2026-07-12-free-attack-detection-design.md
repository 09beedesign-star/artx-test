# Free Attack Detection Design

## Goal

Detect common hostile traffic without adding Tencent Cloud paid products, surface actionable incidents in the existing admin risk and notification views, and preserve normal application behavior.

## Scope

- Detect application-visible authentication failures, authorization denials, rate-limit rejections, and sensitive administrative endpoint bursts.
- Detect reverse-proxy-visible probe paths, including WordPress, `.env`, `.git`, PHP administration, CGI, and router scans.
- Create one deduplicated risk event per source fingerprint and rule window, with an audit record and a matching unread admin notification.
- Keep short, structured, redacted local security logs with rotation.
- Notify the existing Tencent Cloud assistant recipient only through an already-configured basic monitoring or alert bridge. The application will not store WeChat identifiers, Tencent Cloud credentials, or webhook secrets.

## Non-goals

- No paid WAF, high-defense, full CLS ingestion, SMS, or automatic IP blocking.
- No collection of request bodies, access tokens, API keys, email addresses, phone numbers, or raw IP addresses in admin risk records.
- No changes to payments, credits, orders, feedback submission, AI generation, or normal admin workflows.

## Architecture

The Node service will expose a small security-event recorder used by authentication and API middleware. It will aggregate events using a one-way source fingerprint and bounded time windows. When a threshold is crossed, it writes a risk event through the existing `recordRiskEvent` path so that the established risk panel, message center, unread counters, and audit log remain the only operator interface.

Nginx will continue to reject and limit requests before the application. A local, privileged collector will periodically summarize only its own security-relevant access-log patterns and send aggregate events to the same recorder. It will not copy full access logs into application data. The collector and the Node service will write only timestamp, event rule, count, HTTP status class, and a keyed source fingerprint.

## Detection Rules

| Rule | Initial threshold | Window | Severity |
| --- | --- | --- | --- |
| Sensitive-path probes | 3 matching requests | 10 minutes | high |
| Login failures | 5 failures for one source or account fingerprint | 15 minutes | high |
| Authorization denials | 10 denials for one source fingerprint | 10 minutes | warning |
| Rate-limit rejections | 20 responses | 5 minutes | warning |
| Server errors | 5 responses with 5xx status | 5 minutes | critical |

Rules emit at most once per fingerprint and window. They alert only; no rule blocks, alters, or deletes user, payment, order, or API data.

## Notification Flow

1. Nginx or the Node service observes a qualifying request and records an aggregate signal.
2. The detector validates the signal, deduplicates it, and emits an existing risk event.
3. The admin store creates the risk entry, unread notification, and audit record.
4. A high-severity event is written to the short-lived structured security log.
5. The server's preconfigured Tencent Cloud basic-monitoring alert bridge, if present, forwards the aggregate event to the Tencent Cloud assistant service-account recipient. Missing alert-bridge configuration must not fail the user request.

## Failure Handling

- Detector failures are logged and never fail an application request.
- Collector read failures raise a local health warning, not a false attack event.
- Event persistence failures use the existing admin-store error handling and do not expose details to visitors.
- Notifications contain only event type, severity, count, time, and redacted source fingerprint.

## Verification

- Unit tests cover every threshold, window deduplication, redaction, and non-blocking error path.
- Admin-store tests assert that emitted detections appear in the risk panel and message-center source data with a matching audit record.
- A local Nginx-log fixture verifies probe classification without persisting raw paths or IP addresses.
- `pnpm check`, focused Vitest tests, and `pnpm build` must pass before release.
- Deployment verification checks the updated admin endpoint and confirms health without sending real attack traffic to production.
