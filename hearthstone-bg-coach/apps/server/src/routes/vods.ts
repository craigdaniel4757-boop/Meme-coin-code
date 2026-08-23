import { randomUUID } from "node:crypto";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { config, paths } from "../config";
import { store } from "../db/store";
import { asyncHandler } from "../lib/asyncHandler";
import { runPipeline } from "../pipeline/runPipeline";
import { Job } from "../types/schemas";

const ALLOWED_MIME = new Set(["video/mp4", "video/quicktime", "video/webm", "video/x-matroska"]);

const upload = multer({
  storage: multer.diskStorage({
    destination: paths.videos,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || ".mp4";
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: config.maxUploadBytes },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(Object.assign(new Error("Unsupported file type. Upload an mp4, mov, webm, or mkv recording."), { status: 400 }));
    }
  },
});

export const vodsRouter = Router();

vodsRouter.post("/", upload.single("video"), asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No video file was uploaded (expected multipart field name 'video')." });
    return;
  }

  const job: Job = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    status: "uploaded",
    originalFilename: req.file.originalname,
    videoFilename: req.file.filename,
    error: null,
    reportId: null,
    isDemo: config.demoMode,
  };

  await store.createJob(job);
  // Fire-and-forget: the pipeline updates job status as it progresses, and
  // the client polls GET /:id/status. See README re: a real job queue.
  void runPipeline(job);

  res.status(202).json({ jobId: job.id, isDemo: job.isDemo });
}));

vodsRouter.get("/:id/status", asyncHandler(async (req, res) => {
  const job = await store.getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found." });
    return;
  }
  res.json({ jobId: job.id, status: job.status, error: job.error, reportId: job.reportId, isDemo: job.isDemo });
}));

vodsRouter.get("/:id/report", asyncHandler(async (req, res) => {
  const job = await store.getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found." });
    return;
  }
  if (job.status !== "complete" || !job.reportId) {
    res.status(409).json({ error: "Report is not ready yet.", status: job.status });
    return;
  }
  const report = await store.getReport(job.reportId);
  if (!report) {
    res.status(404).json({ error: "Report not found." });
    return;
  }
  res.json({ report, videoUrl: `/media/videos/${job.videoFilename}` });
}));
