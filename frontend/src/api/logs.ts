import type { LogEntry } from "../types/log";
import { istek } from "./http";

export function listLogs(limit = 200) {
  return istek<LogEntry[]>(`/logs?limit=${limit}`);
}
