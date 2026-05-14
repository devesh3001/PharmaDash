import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { authenticate, requireRole } from "../middleware/auth.middleware";
import {
  createOrder,
  listOrders,
  getOrder,
  updateOrderStatus,
  processPayment,
} from "../controllers/orders.controller";

export const ordersRouter = Router();

// All order routes require authentication
ordersRouter.use(authenticate);

ordersRouter.post("/", requireRole("CUSTOMER"), asyncHandler(createOrder));
ordersRouter.get("/", asyncHandler(listOrders));
ordersRouter.get("/:id", asyncHandler(getOrder));
ordersRouter.patch("/:id/status", requireRole("RIDER", "ADMIN"), asyncHandler(updateOrderStatus));
ordersRouter.post("/:id/payment", requireRole("CUSTOMER"), asyncHandler(processPayment));
