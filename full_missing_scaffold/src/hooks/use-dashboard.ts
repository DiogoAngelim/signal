import { useQuery } from "@tanstack/react-query";
import { DashboardAdapter } from "@/lib/dashboard-adapter";

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: DashboardAdapter.getDashboardData,
  });
}