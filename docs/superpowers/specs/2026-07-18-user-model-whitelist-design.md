# User Model Whitelist Design

## Goal

Allow an administrator to control the selectable AI models for every user account. All selectable models are enabled by default. Disabling a model for one user prevents that user from selecting or invoking it.

## Scope

- Govern only models presented in the frontend model picker: the image and text entries from `server/model-router.ts`.
- Apply to every account type, including test accounts.
- Do not govern fixed backend function routes such as PicWish processing or BKEEL provider internals.
- Preserve historical users as fully enabled until an administrator saves an explicit selection.

## Data Model

`StoredUser` gains an optional `allowedAiModels?: string[]` field. An absent field means every selectable model is allowed. When present, its values are normalized against the server model catalog and may be an empty array, which denies every selectable model.

The authentication session response includes the effective allowed image and text model IDs. This avoids a second client-side permission source and lets the canvas filter its existing picker.

## Enforcement

The server resolves a request to its canonical selectable model before billing or provider work. If that model is not allowed for the authenticated user, it returns `403` and records an audit event. Fixed non-selectable models skip this check. The same check applies to synchronous routes, background tasks, orchestration, and MCP requests.

## Admin Experience

The existing account detail drawer adds a compact `模型权限` section. Image and text models are displayed as labeled switches. All switches start on for a new or untouched account. Saving persists the selected IDs and refreshes the account detail.

## Validation

Unit tests cover default access, normalization, admin updates, denial of a disabled selectable model, and the fact that fixed backend models remain allowed. Client tests assert that the account drawer renders the model controls and that disabled models are absent from the canvas model menu.
