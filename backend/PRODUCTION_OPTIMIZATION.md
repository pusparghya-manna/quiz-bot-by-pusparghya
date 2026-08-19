# Production optimization (main branch)

## What changed

### Database
- Normalized SQL tables: `exams`, `questions`, `students`, `student_teachers`, `attempts`, `attempt_answers`, `audit_logs`, `system_settings`, `question_bank`, `broadcast_jobs`
- Legacy `app_data` JSON blobs are **not deleted**
- On first boot with empty normalized tables + existing blobs, migration runs automatically
- Backup snapshot written to `app_data_backup` before migration

### Telegram
- All outbound text goes through `sendSafeTelegramMessage`
- Auto-splits messages over ~4000 characters
- Timeouts (12s), retries, 429 backoff

### Broadcast
- `POST /api/broadcast` queues work and returns immediately
- Background worker sends with rate limiting

### Ranking
- Still updated on submit via `updateExamRanks` (not on every results page open beyond existing code)

## Migrate manually

```bash
cd backend
npm run db:migrate
```

## Rollback

1. Normalized tables can be ignored; re-enable blob-only store from git history if needed
2. `app_data` and `app_data_backup` retain original JSON
3. Set `DATABASE_SCHEMA_VERSION` meta is informational only

## Verify

```bash
npm test
```

Compare counts: exams / students / attempts in blobs vs SQL after migration logs.
