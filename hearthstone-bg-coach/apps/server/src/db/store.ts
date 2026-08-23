import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import { paths } from "../config";
import { Job, JobSchema, Report, ReportSchema } from "../types/schemas";

interface JobsFile {
  jobs: Job[];
}

function ensureStorageReady(): void {
  for (const dir of [paths.videos, paths.frames, paths.reportsDir]) {
    fssync.mkdirSync(dir, { recursive: true });
  }
  if (!fssync.existsSync(paths.jobsFile)) {
    fssync.writeFileSync(paths.jobsFile, JSON.stringify({ jobs: [] } satisfies JobsFile, null, 2));
  }
}
ensureStorageReady();

// A flat JSON file is enough for a single-process scaffold; swap this module
// for a real database without touching any pipeline/route code (see README).
// The write queue below just prevents two concurrent updateJob calls from
// reading-modifying-writing the file out of order and clobbering each other.
let writeQueue: Promise<unknown> = Promise.resolve();
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(fn, fn);
  writeQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function readJobsFile(): Promise<JobsFile> {
  const raw = await fs.readFile(paths.jobsFile, "utf-8");
  return JSON.parse(raw) as JobsFile;
}

async function writeJobsFile(data: JobsFile): Promise<void> {
  await fs.writeFile(paths.jobsFile, JSON.stringify(data, null, 2));
}

export const store = {
  async createJob(job: Job): Promise<Job> {
    return enqueue(async () => {
      const data = await readJobsFile();
      data.jobs.push(JobSchema.parse(job));
      await writeJobsFile(data);
      return job;
    });
  },

  async getJob(id: string): Promise<Job | null> {
    const data = await readJobsFile();
    return data.jobs.find((j) => j.id === id) ?? null;
  },

  async listJobs(): Promise<Job[]> {
    const data = await readJobsFile();
    return [...data.jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async updateJob(id: string, patch: Partial<Omit<Job, "id">>): Promise<Job | null> {
    return enqueue(async () => {
      const data = await readJobsFile();
      const index = data.jobs.findIndex((j) => j.id === id);
      if (index === -1) return null;
      data.jobs[index] = JobSchema.parse({ ...data.jobs[index], ...patch });
      await writeJobsFile(data);
      return data.jobs[index];
    });
  },

  async saveReport(report: Report): Promise<void> {
    const filePath = path.join(paths.reportsDir, `${report.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(ReportSchema.parse(report), null, 2));
  },

  async getReport(id: string): Promise<Report | null> {
    const filePath = path.join(paths.reportsDir, `${id}.json`);
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      return ReportSchema.parse(JSON.parse(raw));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  },
};
