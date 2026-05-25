import { Router, type IRouter } from "express";
import healthRouter from "./health";
import capitalDeskRouter from "./capital-desk";

const router: IRouter = Router();

router.use(healthRouter);
router.use(capitalDeskRouter);

export default router;
