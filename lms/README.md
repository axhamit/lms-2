# GSN Foundation LMS v2 — Next.js + Express + MongoDB + AWS S3 + Jitsi

Roles: **admin**, **trainer**, **student** (separate panels, JWT login, admin creates all accounts).

## Features
- Live classes: in-portal video (Jitsi embed) or external link (Zoom/Meet/Teams); "Generate Jitsi link" helper
- Join window (opens 10 min before start, closes at end) and Upcoming / Live now / Completed tags
- Attendance = real time spent in the room (heartbeat every 20 s), per-class report + CSV export
- Class recording (trainer browser -> S3 multipart upload) or manual upload; students stream recordings
- Assignments with file uploads to S3, grading, feedback, late flag
- Study material uploads (S3), private files served through short-lived signed URLs
- Progress + certificate (PDF) only after the course is complete; public certificate verification page
- Email reminders before class (Nodemailer + cron), forgot/reset password, forced password change for admin-issued passwords
- Production: helmet, rate limits, CORS allow-list, bcrypt, token versioning (logout all devices), env validation, health check, graceful shutdown, Docker

## Run locally
1. Needs Node 18+ and MongoDB.
2. Backend:   cd backend && npm install && edit .env && npm run seed && npm run dev
3. Frontend:  cd frontend && npm install && npm run dev
4. Open http://localhost:3000 and log in with ADMIN_EMAIL / ADMIN_PASSWORD.

## Email delivery
Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `MAIL_FROM` in `backend/.env` to your SMTP provider's values. When SMTP is configured, new accounts receive a welcome email with their login link and temporary credentials. If `SMTP_HOST` is empty or delivery fails, the account is still created and the admin page reports that the welcome email was not sent. Set `CLIENT_URL` to the frontend's public URL so the email's login link points to the right site. For Gmail, use an app password rather than your normal account password.

## AWS S3 setup (needed for file uploads and recordings)
1. Create a **private** bucket (Block all public access = ON). Set S3_BUCKET and AWS_REGION in backend/.env.
2. Bucket CORS (replace the origin with your frontend URL):
   [{"AllowedHeaders":["*"],"AllowedMethods":["PUT","GET","HEAD"],"AllowedOrigins":["http://localhost:3000","https://your-frontend.com"],"ExposeHeaders":["ETag"],"MaxAgeSeconds":3000}]
   `ExposeHeaders: ETag` is required for recordings.
3. IAM policy for the backend user/role (use an IAM role on EC2/ECS instead of keys in production):
   s3:PutObject, s3:GetObject, s3:DeleteObject, s3:AbortMultipartUpload, s3:ListBucket, s3:ListBucketMultipartUploads on the bucket and bucket/*
4. Add a lifecycle rule: "Delete incomplete multipart uploads after 1 day".

## Video: read this before going live
- The public server meet.jit.si limits embedded calls to a few minutes. For real classes use your own Jitsi server (JITSI_DOMAIN)
  or 8x8 JaaS (JAAS_APP_ID, JAAS_KID, JAAS_PRIVATE_KEY). The "External link" option always works with any provider.
- Attendance minutes are only measurable for in-portal rooms. External links count as full attendance on click.
- Browser recording captures the trainer's shared tab (Chrome/Edge on desktop, tick "Share tab audio"). For unattended,
  server-side recording of every class run Jibri on a self-hosted Jitsi.

## Production checklist
- NODE_ENV=production, JWT_SECRET 32+ random chars, HTTPS everywhere, CLIENT_URL = exact frontend URL
- MongoDB Atlas (or replica set) with backups; IAM role for S3; real SMTP (SES / SendGrid / Gmail app password)
- Run reminders on one instance only (RUN_JOBS=false on the others)
- The JWT is kept in localStorage; keep dependencies updated and avoid third-party scripts in the frontend
- Docker: docker compose up --build -d  (edit the API URL in docker-compose.yml first)
