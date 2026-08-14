# Turso → PostgreSQL migration

## Goal
Preserve existing teachers, exams, questions, students, attempts, and settings.

## Steps
1. Provision Railway PostgreSQL (Postgres 16+).
2. Deploy Spring Boot once so Flyway applies `V1__init.sql`.
3. Export Turso data (legacy Node used `teachers` + `app_data` JSON keys).
4. Map JSON keys `exams`, `questionBank`, `students`, `attempts`, `settings` into relational tables matching Flyway schema.
5. Load SQL inside a transaction; verify counts.
6. Point `DATABASE_URL` to Postgres and cut over.
7. Keep Turso until verification succeeds — do not delete source data.
