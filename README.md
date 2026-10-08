# Term II — Tharun

Phone-first timetable, attendance and deadline tracker. Static front end + Vercel Functions + Vercel Blob (private).

## Deploy (CLI)
    npm i -g vercel
    cd tharun-termii
    vercel deploy --prod      # project name: tharun-termii

## One-time setup in Vercel (project → Storage / Settings)
1. Storage → Create → Blob → access: Private → connect to this project (adds BLOB_READ_WRITE_TOKEN).
2. Settings → Environment Variables (Production):
   - EDIT_PASSWORD = your edit password
   - VIEW_PIN      = 139
3. Deployments → latest → Redeploy.
