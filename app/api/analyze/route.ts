import "server-only";
import { handleAnalyze } from "../../../lib/endpoint";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: Request) {
  return handleAnalyze(request);
}
