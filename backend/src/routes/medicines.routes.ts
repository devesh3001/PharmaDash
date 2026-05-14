import { Router } from "express";
import { listMedicines, scanPrescription } from "../controllers/medicines.controller";
import { asyncHandler } from "../middleware/asyncHandler";

export const medicinesRouter = Router();

medicinesRouter.get("/", asyncHandler(listMedicines));
medicinesRouter.post("/scan", asyncHandler(scanPrescription));
