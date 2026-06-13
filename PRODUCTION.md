# Production Notes

This backend is still a modular monolith. Keep it that way until traffic or team ownership forces service extraction.

## Required environment

- `MONGO_URI`
- `JWT_SECRET`
- `EMAIL_USER`
- `EMAIL_PASS`
- `EMAIL_FROM`
- `EMAIL_PROVIDER`: use `smtp` for Gmail SMTP, or `resend` only after the sender domain is verified
- `SMTP_HOST`, defaults to `smtp.gmail.com`
- `SMTP_PORT`, defaults to `587`
- `SMTP_SECURE`, set `true` only for port `465`
- `CORS_ORIGINS` as a comma-separated list
- `CRON_SECRET` for `/api/cron/reset-month`
- `PORT`, defaults to `8080`

## Email delivery

For Gmail SMTP, `EMAIL_USER` must be the Gmail account and `EMAIL_PASS` must be a Google App Password, not the normal Gmail password. The Google account must have 2-step verification enabled before an App Password can be created.

For Resend, set `EMAIL_PROVIDER=resend`, set `RESEND_API_KEY`, and set `EMAIL_FROM` to an address on a verified domain. Configure the domain DNS records that Resend provides: SPF/TXT, DKIM/TXT or CNAME, and DMARC/TXT. Do not use an unverified Gmail address as `EMAIL_FROM` with Resend.

Keep `EMAIL_PROVIDER=smtp` on Render unless you have completed Resend domain verification. Stale or test Resend keys should be removed from Render to avoid confusing deployments.

Useful tuning knobs:

- `EMAIL_RETRY_ATTEMPTS`, defaults to `3`
- `EMAIL_RETRY_BASE_DELAY_MS`, defaults to `750`
- `BILL_EMAIL_CONCURRENCY`, defaults to `2`
- `SMTP_CONNECTION_TIMEOUT_MS`, defaults to `10000`
- `SMTP_GREETING_TIMEOUT_MS`, defaults to `10000`
- `SMTP_SOCKET_TIMEOUT_MS`, defaults to `20000`

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
