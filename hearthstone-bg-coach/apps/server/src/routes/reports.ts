import { Router } from "express";
import { getSampleReport } from "../data/sampleReport";
import { store } from "../db/store";
import { asyncHandler } from "../lib/asyncHandler";

export const reportsRouter = Router();

const SAMPLE_REPORT_ID = "sample";

/** Powers the landing page's "see a sample report" link - no upload required. */
reportsRouter.get(
  "/sample",
  asyncHandler(async (_req, res) => {
    let report = await store.getReport(SAMPLE_REPORT_ID);
    if (!report) {
      report = getSampleReport(SAMPLE_REPORT_ID);
      await store.saveReport(report);
    }
    res.json({ report, videoUrl: null });
  }),
);
