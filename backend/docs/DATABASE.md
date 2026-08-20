# Database

## Source of truth
Turso/SQLite normalized tables. Legacy `app_data` blobs remain for rollback only.

## Layers
HTTP/Telegram → services → repositories → Turso SQL

## Transactions
`withWriteTx` / `batchWrite` in `database/client.ts` wrap multi-step writes:
- exam + question replacement
- attempt upsert / conditional submit
- student + teacher links
- cascading deletes

## Idempotency
- Answer UPSERT on `(attempt_id, question_id)`
- `submitIfInProgress` only transitions `IN_PROGRESS`
- `telegram_processed_updates` for Telegram `update_id`
- `schema_meta.blob_migrated_v1` for migration

## Schema
See `src/database/schema.ts`. Indexes cover teacher/exam/telegram/status/rank queries.
