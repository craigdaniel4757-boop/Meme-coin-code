# Deploying TavernIQ

The app ships as a single [`Dockerfile`](../Dockerfile) at the project root: it
builds both the web app and the API, then runs one Node process that serves
the frontend as static files *and* the API from the same port (see the
static-serving block in `apps/server/src/index.ts`). One container, one URL -
no second service, no CORS setup needed.

That means deploying it is the same recipe on almost any host that can build
a Dockerfile: **Render, Railway, and Fly.io all work with zero changes.**
Steps below are for Render (free tier, simplest GitHub-connect flow); the
"other hosts" section at the bottom covers the others.

## Render

1. Push this repo to GitHub if it isn't already (it is, if you're reading
   this from the repo).
2. Go to [render.com](https://render.com) and sign up/log in - the "Sign up
   with GitHub" option is fastest and grants repo access at the same time.
3. **New +** → **Web Service** → pick this repository and branch.
4. Render will ask for a few settings:
   - **Root Directory**: `hearthstone-bg-coach` (this matters - the repo has
     other content above this folder)
   - **Environment / Runtime**: Docker (Render auto-detects the `Dockerfile`
     once the root directory is set correctly)
   - **Instance Type**: Free is enough to run this
5. Add environment variables (**Environment** tab):
   | Key | Value | Required? |
   |---|---|---|
   | `ANTHROPIC_API_KEY` | your key | optional - omit to run in demo mode |
   | `ANTHROPIC_MODEL` | `claude-opus-5` | optional, this is already the default |
   | `FRAME_INTERVAL_SECONDS` | `3` | optional |
   | `MAX_UPLOAD_MB` | `500` | optional |

   Don't set `PORT` - Render injects it itself and the app already reads
   `process.env.PORT`.
6. **Create Web Service.** First build takes a few minutes (installing
   ffmpeg + both npm installs + both builds). You'll get a URL like
   `https://tavern-iq.onrender.com`.

That's it - visit the URL, it's the same landing page.

### What to expect on Render's free tier

- **Cold starts.** A free instance spins down after ~15 minutes idle. The
  next visit takes 30-60s to wake back up before the page loads - normal,
  not a bug.
- **Ephemeral disk.** Uploaded videos, extracted frames, and the job/report
  JSON store all live on local disk (see `docs/ARCHITECTURE.md` → Storage).
  Render's free tier disk is wiped on every redeploy and restart. Demo mode
  and the sample report are unaffected (they're generated fresh each time),
  but any real analyses a visitor generates won't survive a redeploy. Fine
  for showing off the product; not fine as durable storage for real users -
  see the "next step" below if that matters to you.
- **No `ffmpeg` surprises.** It's installed in the image itself
  (`Dockerfile`'s runtime stage), so live analysis works the same as local
  dev as soon as `ANTHROPIC_API_KEY` is set.

### If you want uploads/reports to actually persist

Swap `apps/server/src/db/store.ts` (and the video/frame paths in
`apps/server/src/config.ts`) for real storage - a Render persistent disk
(paid tier) is the smallest change; S3 + Postgres is the "real" version.
Neither the pipeline nor the routes need to change - they only call
`store.createJob/updateJob/getJob/saveReport/getReport`, so this is an
isolated swap. Not done here to keep the deploy itself simple and free.

## Other hosts (same Dockerfile)

- **Railway.app**: New Project → Deploy from GitHub repo → set the root
  directory the same way → it detects the Dockerfile automatically. Same
  env vars.
- **Fly.io**: `fly launch` from inside `hearthstone-bg-coach/` detects the
  Dockerfile and asks a few prompts; `fly deploy` after that. Set secrets
  with `fly secrets set ANTHROPIC_API_KEY=...`.
- **Any other Docker-capable host** (a VPS, Cloud Run, ECS, etc.): the image
  builds and runs the same way everywhere -
  `docker build -t tavern-iq . && docker run -p 8787:8787 -e ANTHROPIC_API_KEY=... tavern-iq`.

## Verifying a deploy

Once it's live:
```
curl https://<your-url>/api/health
# {"status":"ok","demoMode":true,"model":"claude-opus-5"}
```
`demoMode: false` confirms `ANTHROPIC_API_KEY` was picked up. Then visit
`/report/sample` in a browser to confirm the frontend is served correctly.
