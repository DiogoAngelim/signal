export interface HealthStatus {
  status: string;
}

export interface SignalPayload {
  message: string;
  operation?: string;
  data?: unknown;
}

export interface SignalResponse {
  id: string;
  status: "success" | "error" | "processing";
  result?: unknown;
  message?: string;
  timestamp: string;
  duration?: number;
}
