import { type IRouter, Router } from "express";
import { createSignalApiRouter } from "../api/signal-routes.js";
import binanceExecutionRouter from "./binance-execution";
import healthRouter from "./health";
import stocksRouter from "./stocks";

const router: IRouter = Router();

router.use(healthRouter);
router.use(createSignalApiRouter());
router.use(stocksRouter);
router.use(binanceExecutionRouter);

export default router;
