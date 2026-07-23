import { useQuery } from "@tanstack/react-query";

import { listLogs } from "../api/logs";

export function useLogs(limit = 200) {
  return useQuery({
    queryKey: ["logs", limit],
    queryFn: () => listLogs(limit),
  });
}
