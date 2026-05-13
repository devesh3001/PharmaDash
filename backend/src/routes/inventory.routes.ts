import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { authenticate, requireRole } from "../middleware/auth.middleware";
import {
  listInventory,
  getInventoryItem,
  updateStock,
} from "../controllers/inventory.controller";

export const inventoryRouter = Router();

// All inventory management is admin-only
inventoryRouter.use(authenticate, requireRole("ADMIN"));

inventoryRouter.get("/", asyncHandler(listInventory));
inventoryRouter.get("/:id", asyncHandler(getInventoryItem));
inventoryRouter.patch("/:id", asyncHandler(updateStock));
