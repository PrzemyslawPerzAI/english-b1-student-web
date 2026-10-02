# Student access protection

The Student Web supports server-side PIN protection without exposing the PIN in browser code or GitHub.

## Vercel environment variables

Set these for **Production**:

- `STUDENT_PIN` — family-chosen PIN/password. Do not commit it to GitHub.
- `SESSION_SECRET` — a long random secret (at least 32 random characters). Do not reuse the PIN.

After both variables exist, redeploy Production. Protection activates automatically.

## Behaviour

- Without both variables the app remains usable in DEV/public migration mode.
- With both variables, `/api/student` returns 401 until a valid signed HttpOnly cookie exists.
- `/api/login` validates the PIN server-side.
- Session cookie: HttpOnly, Secure, SameSite=Strict, 12-hour lifetime.
- `/api/logout` clears the session.
- `/api/health` exposes no learner data.

This is suitable for preventing casual public access. It is not a replacement for enterprise identity/access management.
