import { Router, type IRouter } from "express";
import healthRouter from "./health";
import stocksRouter from "./stocks";

const router: IRouter = Router();

router.use(healthRouter);
router.use(stocksRouter);

export default router;
