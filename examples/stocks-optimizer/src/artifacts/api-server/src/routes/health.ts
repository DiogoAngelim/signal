import { HealthCheckResponse } from "@workspace/api-zod";
import { type IRouter, Router } from "express";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

export default router;
