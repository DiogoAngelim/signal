import { Router, type IRouter } from "express";
import binanceExecutionRouter from "./binance-execution";
import healthRouter from "./health";
import stocksRouter from "./stocks";

const router: IRouter = Router();

router.use(healthRouter);
router.use(stocksRouter);
router.use(binanceExecutionRouter);

export default router;
