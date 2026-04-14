import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import showsRouter from "./shows.js";
import singersRouter from "./singers.js";
import songsRouter from "./songs.js";
import queueRouter from "./queue.js";
import utilsRouter from "./utils.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(showsRouter);
router.use(singersRouter);
router.use(songsRouter);
router.use(queueRouter);
router.use(utilsRouter);

export default router;
