import { Router } from "express";
import { config } from "../config";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.json({ status: "ok", demoMode: config.demoMode, model: config.anthropicModel });
});
