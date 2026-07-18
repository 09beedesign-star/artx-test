# OpenAI-Compatible API Design

## Goal

Allow third-party agents that only support custom OpenAI-compatible models to call ArtX with an `artx_sk_` API key.

## Surface

- `GET /v1/models` returns only ArtX user-facing model IDs.
- `POST /v1/chat/completions` accepts OpenAI-style `model`, `messages`, and optional image-generation fields.
- Requests authenticate through `Authorization: Bearer artx_sk_...`.

## Behavior

- Image model IDs dispatch to the existing ArtX image orchestration path and return an OpenAI chat-completion response whose assistant content contains generated image URLs.
- `gpt-5.4-mini` dispatches to existing text generation and returns assistant text.
- The first release rejects `stream: true` with a clear validation error.
- Existing API-key identity, user model permissions, credit reservation, usage ledger, third-party usage event monitoring, and rate/error handling are reused.

## Security And Billing

- The endpoint never returns raw ArtX keys or provider credentials.
- `/v1/models` contains only frontend-selectable models.
- A successful or failed compatible request creates the same user AI usage and external-agent monitoring event as MCP.

## Verification

- Tests cover authenticated model listing, rejected invalid keys, text completion, image completion, model permission denial, and `stream: true` rejection.
- Build and production health checks run before formal deployment.
