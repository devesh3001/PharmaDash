import { Router } from "express";
import { listMedicines } from "../controllers/medicines.controller";
import { asyncHandler } from "../middleware/asyncHandler";

export const medicinesRouter = Router();

medicinesRouter.get("/", asyncHandler(listMedicines));
