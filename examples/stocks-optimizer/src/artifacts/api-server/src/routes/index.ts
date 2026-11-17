import { type IRouter, Router } from "express";
import { createSignalApiRouter } from "../api/signal-routes.js";
import binanceExecutionRouter from "./binance-execution";
import healthRouter from "./health";
import luminaRouter from "./lumina";
import stocksRouter from "./stocks";

const router: IRouter = Router();

router.use(healthRouter);
router.use(createSignalApiRouter());
router.use(stocksRouter);
router.use(binanceExecutionRouter);
router.use(luminaRouter);

export default router;
