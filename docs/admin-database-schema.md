# Admin Database Schema Plan

This is the production database target for the ArtX admin backend. The current MVP uses the JSON repository in `server/admin-store.ts`; a Postgres adapter should preserve these table boundaries.

## Core Tables

### admin_users
- `id uuid primary key`
- `username text unique not null`
- `password_hash text not null`
- `salt text not null`
- `role text not null check role in ('viewer','support','finance','admin','super_admin')`
- `status text not null check status in ('active','disabled')`
- `failed_login_count integer not null default 0`
- `locked_until timestamptz`
- `created_at timestamptz not null`
- `last_login_at timestamptz`

### users
- `id uuid primary key`
- `account text unique not null`
- `email text`
- `display_name text`
- `role text not null default 'viewer'`
- `status text not null default 'normal'`
- `plan_id text`
- `organization text`
- `registered_at timestamptz not null`
- `last_seen_at timestamptz`

### credit_accounts
- `user_id uuid primary key references users(id)`
- `balance integer not null default 0`
- `frozen_credits integer not null default 0`
- `expired_credits integer not null default 0`
- `total_recharge numeric(12,2) not null default 0`
- `total_consumed integer not null default 0`
- `updated_at timestamptz not null`

### credit_ledger
- `id uuid primary key`
- `user_id uuid not null references users(id)`
- `delta integer not null`
- `type text not null`
- `reason text not null`
- `source_type text not null`
- `source_id text not null`
- `operator_id text`
- `operator_name text`
- `created_at timestamptz not null`

### orders
- `id text primary key`
- `user_id uuid not null references users(id)`
- `plan_id text not null`
- `package_name text not null`
- `channel text not null check channel in ('wechat','alipay','stripe','paypal')`
- `amount numeric(12,2) not null`
- `expected_credits integer not null`
- `issued_credits integer not null default 0`
- `status text not null check status in ('pending','paid','failed','refunded')`
- `reconciliation text not null check reconciliation in ('pending','matched','mismatch')`
- `created_at timestamptz not null`
- `paid_at timestamptz`

### payment_events
- `id uuid primary key`
- `order_id text not null references orders(id)`
- `channel text not null`
- `event_type text not null`
- `provider_transaction_id text`
- `amount numeric(12,2)`
- `raw_payload jsonb`
- `signature_valid boolean`
- `processed_at timestamptz`
- `created_at timestamptz not null`

### ai_tasks
- `id uuid primary key`
- `generation_id text not null`
- `backend_task_id text not null`
- `provider_task_id text`
- `user_id uuid not null references users(id)`
- `capability text not null`
- `provider text not null`
- `model text not null`
- `status text not null`
- `latency_ms integer not null default 0`
- `failure_reason text`
- `input_units integer not null default 0`
- `output_units integer not null default 0`
- `estimated_cost numeric(12,4) not null default 0`
- `charged_credits integer not null default 0`
- `gross_margin numeric(8,4) not null default 0`
- `created_at timestamptz not null`

### ai_billing_policies
- `capability text primary key`
- `label text not null`
- `billing_unit text not null check billing_unit in ('per_request','per_image')`
- `base_credits integer not null`
- `per_output_credits integer not null default 0`
- `estimated_cost_per_unit numeric(12,4) not null default 0`
- `provider_default text not null`
- `updated_by text`
- `updated_at timestamptz not null`

### ai_plan_discounts
- `plan_id text primary key`
- `label text not null`
- `multiplier numeric(8,4) not null`
- `updated_by text`
- `updated_at timestamptz not null`

### provider_health
- `id text primary key`
- `name text not null`
- `category text not null`
- `state text not null`
- `latency_ms integer`
- `credential_status text not null`
- `config_location text not null`
- `owner text not null`
- `last_checked_at timestamptz not null`

### feedback_tickets
- `id uuid primary key`
- `user_id uuid references users(id)`
- `title text not null`
- `content text not null`
- `module text not null`
- `status text not null`
- `priority text not null`
- `linked_order_id text`
- `linked_task_id text`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

### alerts
- `id uuid primary key`
- `category text not null`
- `title text not null`
- `detail text not null`
- `severity text not null`
- `owner text not null`
- `unread boolean not null default true`
- `linked_section text`
- `created_at timestamptz not null`

### audit_logs
- `id uuid primary key`
- `actor_id text not null`
- `actor_name text not null`
- `action text not null`
- `target text not null`
- `reason text`
- `before jsonb`
- `after jsonb`
- `ip text`
- `device text`
- `created_at timestamptz not null`

## Required Indexes

- `credit_ledger(user_id, created_at desc)`
- `orders(user_id, created_at desc)`
- `orders(status, reconciliation)`
- `payment_events(order_id, created_at desc)`
- `ai_tasks(user_id, created_at desc)`
- `ai_tasks(provider, model, status, created_at desc)`
- `alerts(unread, severity, created_at desc)`
- `audit_logs(actor_id, created_at desc)`
- `audit_logs(target, created_at desc)`
- `admin_users(locked_until)`

## Security Rules

- Sessions must expire through `expires_at`; expired tokens are rejected and removed.
- Login attempts are locked after repeated failures. Defaults are 5 failures and 15 minutes.
- The last active `super_admin` cannot be disabled or downgraded.
- A logged-in admin cannot disable their own account.
- AI billing policy changes require the confirmation phrase `CONFIRM_AI_BILLING_POLICY`.
- Credit adjustments of 10,000 credits or more require `confirmHighRisk=true`.
- Audit logs should be append-only in Postgres. Do not expose update or delete operations for `audit_logs`.

## Migration Order

1. Add Postgres adapter behind the existing `AdminDataRepository` boundary.
2. Backfill JSON data into Postgres once.
3. Run admin regression tests against `ARTX_ADMIN_DATA_BACKEND=json`.
4. Run the same tests against `ARTX_ADMIN_DATA_BACKEND=postgres`.
5. Switch staging backend to Postgres.
6. Switch production only after payment callback and AI billing smoke tests pass.
