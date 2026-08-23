import fs from "node:fs";
import path from "node:path";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import { config, paths } from "./config";
import { healthRouter } from "./routes/health";
import { reportsRouter } from "./routes/reports";
import { vodsRouter } from "./routes/vods";

const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

app.use("/api/health", healthRouter);
app.use("/api/vods", vodsRouter);
app.use("/api/reports", reportsRouter);

// Serves uploaded videos back so the report page's <video> element can play
// them, synced to whatever timestamps the report references.
app.use("/media/videos", express.static(paths.videos));

// Single-service production deployment: if the web app has been built
// (apps/web/dist - see the Dockerfile), serve it from this same process
// and fall back to index.html for any non-API/media GET so client-side
// routing (e.g. a direct visit to /report/sample) works. In local dev the
// dist dir won't exist yet - Vite's own dev server handles the frontend
// instead, and this block is skipped entirely.
const webDistDir = path.join(__dirname, "../../web/dist");
if (fs.existsSync(webDistDir)) {
  app.use(express.static(webDistDir));
  app.get(/.*/, (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api/") || req.path.startsWith("/media/")) {
      next();
      return;
    }
    res.sendFile(path.join(webDistDir, "index.html"));
  });
}

app.use((req: Request, res: Response) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
});

interface HttpError extends Error {
  status?: number;
  code?: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: HttpError, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  if (err.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: `File too large. Max upload size is ${Math.round(config.maxUploadBytes / (1024 * 1024))}MB.` });
    return;
  }
  const status = typeof err.status === "number" ? err.status : 500;
  res.status(status).json({ error: err.message || "Something went wrong." });
});

app.listen(config.port, () => {
  const mode = config.demoMode ? "DEMO MODE (set ANTHROPIC_API_KEY to enable live analysis)" : `LIVE (${config.anthropicModel})`;
  console.log(`TavernIQ API listening on http://localhost:${config.port} [${mode}]`);
});
