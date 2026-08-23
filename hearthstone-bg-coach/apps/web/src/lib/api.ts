import { JobStatus, Report } from "@/types/report";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error
        : `Request failed with status ${res.status}`;
    throw new Error(message);
  }
  return data as T;
}

export async function uploadVideo(file: File): Promise<{ jobId: string; isDemo: boolean }> {
  const formData = new FormData();
  formData.append("video", file);
  const res = await fetch(`${BASE_URL}/api/vods`, { method: "POST", body: formData });
  return parseJsonOrThrow(res);
}

export async function getJobStatus(jobId: string): Promise<JobStatus> {
  const res = await fetch(`${BASE_URL}/api/vods/${jobId}/status`);
  return parseJsonOrThrow(res);
}

export interface ReportResponse {
  report: Report;
  videoUrl: string | null;
}

export async function getJobReport(jobId: string): Promise<ReportResponse> {
  const res = await fetch(`${BASE_URL}/api/vods/${jobId}/report`);
  return parseJsonOrThrow(res);
}

export async function getSampleReport(): Promise<ReportResponse> {
  const res = await fetch(`${BASE_URL}/api/reports/sample`);
  return parseJsonOrThrow(res);
}

export function resolveMediaUrl(url: string | null): string | null {
  if (!url) return null;
  return url.startsWith("http") ? url : `${BASE_URL}${url}`;
}
