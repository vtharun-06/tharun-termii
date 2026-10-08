# Handoff: tharun-termii (for Claude Code)

## What this is
Phone-first Term II site for Tharun (IIMK PGP 30, Sec B): timetable, attendance, deadlines, exam countdown.
Live: https://tharun-termii.vercel.app

## Stack
- Static front end: index.html, app.js, styles.css (vanilla JS, no build)
- Vercel Functions: api/login.js, api/logout.js, api/state.js; shared code in api/_lib.js
- Timetable snapshot (152 sessions, 7 courses, holidays, exams): api/_data.js
- Data: Vercel Blob, private store "tharun-termii-data" (bom1), file termii/state.json
- Auth: HMAC-signed HttpOnly cookie. Owner = EDIT_PASSWORD (edits). Viewer = VIEW_PIN (read-only).

## Vercel
- Team: vtharun-06's projects (team_j5Eh3cYkMmjxILX2YjnOGZYC)
- Project: tharun-termii (prj_9TP0334C03CxtiWca4r0hhPfwGkX)
- Env set: BLOB_READ_WRITE_TOKEN (auto). Env NOT yet set: EDIT_PASSWORD, VIEW_PIN (owner sets these manually).

## Rules agreed with Tharun
- Attendance: Present/Absent only. Every class is Absent until marked Present. Future classes = "Upcoming", not counted.
- Allowed misses: 3-credit courses (IS, EE, CF, HRM, OS; 24 sessions) = 4; 2-credit (CMA, LEPM; 16 sessions) = 3.
- Midterms 17–20 Nov 2026; End-terms 26–29 Dec 2026.
- Deadline fields: course, title, due date+time, type, remarks, done.
- Overview: exam countdown, ongoing/next class with "Mark present" + "Add deadline", today's classes, attendance + misses left, upcoming deadlines.
- Holiday flags from "Holidays in India" calendar. Only Tharun edits; girlfriend views with PIN.

## Next steps
1. Create private GitHub repo vtharun-06/tharun-termii and push this folder.
2. In Vercel: tharun-termii → Settings → Git → connect that repo.
3. Owner adds EDIT_PASSWORD and VIEW_PIN env vars, then redeploy.
4. Later ideas discussed but parked: session notes, grade tracker, reminders, Excel export.
