# Production Notes

This backend is still a modular monolith. Keep it that way until traffic or team ownership forces service extraction.

## Required environment

- `MONGO_URI`
- `JWT_SECRET`
- `EMAIL_USER`
- `EMAIL_PASS`
- `CORS_ORIGINS` as a comma-separated list
- `CRON_SECRET` for `/api/cron/reset-month`
- `PORT`, defaults to `8080`

## Run shape

Use at least two API replicas behind a load balancer. Keep long-running PDF/email/report work out of the API process when you add a queue.

Recommended container split:

- `api`: `node src/server.js`
- `worker`: future BullMQ/SQS consumer for email, PDF, and monthly reports
- `scheduler`: future cron/EventBridge trigger that enqueues work once

## Health checks

- `/healthz`: process is alive
- `/readyz`: MongoDB is connected

## Next scaling step

Add Redis for cache-aside reads and distributed rate limiting. Good initial cache keys:

- `home:{homeId}`
- `userHomes:{userId}`
- `report:{homeId}:{yyyy-mm}`
- `dashboard:{homeId}`

Invalidate these keys on home, meal, expense, and penalty writes.
