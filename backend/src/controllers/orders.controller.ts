import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { AuthError } from "../middleware/auth.middleware";

function qs(val: unknown): string | undefined {
  return typeof val === "string" ? val : undefined;
}

// ─── Custom Errors ────────────────────────────────────────────────────────────

export class InsufficientStockError extends Error {
  constructor(message = "Insufficient stock for one or more items") {
    super(message);
    this.name = "InsufficientStockError";
  }
}

export class CheckoutValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckoutValidationError";
  }
}

export class OrderNotFoundError extends Error {
  constructor() {
    super("Order not found");
    this.name = "OrderNotFoundError";
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type OrderItemInput = { medicineId: string; quantity: number };

const ORDER_ITEM_SELECT = {
  id: true,
  quantity: true,
  unit_price: true,
  medicine: { select: { id: true, name: true, generic_name: true } },
} as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mergeQuantities(items: OrderItemInput[]): Map<string, number> {
  const merged = new Map<string, number>();
  for (const { medicineId, quantity } of items) {
    if (!medicineId || typeof medicineId !== "string") {
      throw new CheckoutValidationError("Each item must include a medicineId string");
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new CheckoutValidationError("Each item must have a positive integer quantity");
    }
    merged.set(medicineId, (merged.get(medicineId) ?? 0) + quantity);
  }
  return merged;
}

function resolvePharmacyId(
  rows: { pharmacyId: string; medicineId: string; stock_quantity: number }[],
  required: Map<string, number>,
): string | null {
  const byPharmacy = new Map<string, Map<string, number>>();
  for (const row of rows) {
    let m = byPharmacy.get(row.pharmacyId);
    if (!m) {
      m = new Map();
      byPharmacy.set(row.pharmacyId, m);
    }
    m.set(row.medicineId, row.stock_quantity);
  }
  for (const [pharmacyId, stocks] of byPharmacy) {
    const ok = [...required.entries()].every(([id, qty]) => (stocks.get(id) ?? 0) >= qty);
    if (ok) return pharmacyId;
  }
  return null;
}

function formatOrder(order: {
  id: string;
  customerId: string;
  pharmacyId: string;
  status: string;
  total_amount: Prisma.Decimal;
  createdAt: Date;
  orderItems?: {
    id: string;
    quantity: number;
    unit_price: Prisma.Decimal;
    medicine: { id: string; name: string; generic_name: string };
  }[];
}) {
  return {
    id: order.id,
    customerId: order.customerId,
    pharmacyId: order.pharmacyId,
    status: order.status,
    total_amount: order.total_amount.toString(),
    createdAt: order.createdAt,
    ...(order.orderItems
      ? {
          items: order.orderItems.map((item) => ({
            id: item.id,
            quantity: item.quantity,
            unit_price: item.unit_price.toString(),
            medicine: item.medicine,
          })),
        }
      : {}),
  };
}

// ─── Controllers ─────────────────────────────────────────────────────────────

// POST /api/orders
export async function createOrder(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new AuthError("Unauthenticated");

  const { items, promoCode, delivery_address, delivery_lat, delivery_lng, is_emergency } = req.body as {
    items: Array<{ medicineId: string; quantity: number }>;
    promoCode?: string;
    delivery_address?: string;
    delivery_lat?: number;
    delivery_lng?: number;
    is_emergency?: boolean;
  };

  if (!Array.isArray(items) || items.length === 0) {
    throw new CheckoutValidationError("items must be a non-empty array");
  }
  const merged = mergeQuantities(items);
  const medicineIds = [...merged.keys()];
  const customerId = req.user.id;

  const order = await prisma.$transaction(
    async (tx) => {
      const customer = await tx.user.findUnique({ where: { id: customerId } });
      if (!customer) throw new CheckoutValidationError("Customer not found");

      const inventories = await tx.inventory.findMany({
        where: { medicineId: { in: medicineIds } },
        select: { pharmacyId: true, medicineId: true, stock_quantity: true },
      });
      const pharmacyId = resolvePharmacyId(inventories, merged);
      if (!pharmacyId) throw new InsufficientStockError();

      const medicines = await tx.medicine.findMany({
        where: { id: { in: medicineIds } },
        select: { id: true, price: true },
      });
      if (medicines.length !== medicineIds.length) {
        throw new CheckoutValidationError("One or more medicines were not found");
      }

      let total = new Prisma.Decimal(0);
      const priceById = new Map(medicines.map((m) => [m.id, m.price]));
      for (const [medicineId, qty] of merged) {
        const price = priceById.get(medicineId);
        if (!price) throw new CheckoutValidationError("One or more medicines were not found");
        total = total.plus(price.mul(qty));
      }

      for (const [medicineId, qty] of merged) {
        const result = await tx.inventory.updateMany({
          where: { pharmacyId, medicineId, stock_quantity: { gte: qty } },
          data: { stock_quantity: { decrement: qty } },
        });
        if (result.count !== 1) throw new InsufficientStockError();
      }

      return tx.order.create({
        data: {
          customerId,
          pharmacyId,
          total_amount: total,
          status: "PAYMENT_PENDING",
          is_emergency: !!is_emergency,
          delivery_address,
          delivery_lat,
          delivery_lng,
          orderItems: {
            create: [...merged.entries()].map(([medicineId, quantity]) => ({
              medicineId,
              quantity,
              unit_price: priceById.get(medicineId)!,
            })),
          },
        },
        include: { orderItems: { select: ORDER_ITEM_SELECT } },
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5000,
      timeout: 10000,
    },
  );

  res.status(201).json({ order: formatOrder(order) });
}

// GET /api/orders
export async function listOrders(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new AuthError("Unauthenticated");

  const page  = Math.max(1,   parseInt(qs(req.query.page)  ?? "1",  10));
  const limit = Math.min(100, parseInt(qs(req.query.limit) ?? "20", 10));
  const skip  = (page - 1) * limit;
  const statusFilter = qs(req.query.status) as
    | "PENDING" | "ACCEPTED" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED"
    | undefined;

  // Admins see all; riders see PENDING or their own; customers see their own
  const canSeeAll = req.user.role === "ADMIN";
  const isRider = req.user.role === "RIDER";
  const where = {
    ...(canSeeAll ? {} : isRider ? {
      OR: [
        { status: "PENDING" as any },
        { riderId: req.user.id }
      ]
    } : { customerId: req.user.id }),
    ...(statusFilter ? { status: statusFilter } : {}),
  };

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      skip,
      take: limit,
      orderBy: [
        { is_emergency: "desc" },
        { createdAt: "desc" }
      ],
      include: { orderItems: { select: ORDER_ITEM_SELECT } },
    }),
    prisma.order.count({ where }),
  ]);

  res.json({
    data: orders.map(formatOrder),
    meta: { total, page, limit, pages: Math.ceil(total / limit) },
  });
}

// GET /api/orders/:id
export async function getOrder(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new AuthError("Unauthenticated");

  const id = String(req.params.id);
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      orderItems: { select: ORDER_ITEM_SELECT },
      pharmacy: { select: { id: true, name: true, latitude: true, longitude: true } },
      rider: { select: { id: true, full_name: true, phone_number: true } },
    },
  });

  if (!order) throw new OrderNotFoundError();

  // Customers can only see their own orders
  if (req.user.role === "CUSTOMER" && order.customerId !== req.user.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  res.json({ order: formatOrder(order) });
}

// PATCH /api/orders/:id/status   body: { status }
export async function updateOrderStatus(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new AuthError("Unauthenticated");

  const id = String(req.params.id);
  const { status } = req.body as { status?: string };

  const validTransitions: Record<string, string[]> = {
    PAYMENT_PENDING: ["PENDING", "CANCELLED"],
    PENDING: ["ACCEPTED", "CANCELLED"],
    ACCEPTED: ["OUT_FOR_DELIVERY", "CANCELLED"],
    OUT_FOR_DELIVERY: ["DELIVERED"],
    DELIVERED: [],
    CANCELLED: [],
  };

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) throw new OrderNotFoundError();

  if (!status || !(status in validTransitions)) {
    res.status(400).json({
      error: "Invalid status. Must be one of: PAYMENT_PENDING, PENDING, ACCEPTED, OUT_FOR_DELIVERY, DELIVERED, CANCELLED",
    });
    return;
  }

  const allowed = validTransitions[order.status];
  if (!allowed.includes(status)) {
    res.status(409).json({
      error: `Cannot transition from ${order.status} to ${status}. Allowed: ${allowed.join(", ") || "none"}`,
    });
    return;
  }

  let extraData: any = {};
  if (status === "ACCEPTED" && req.user.role === "RIDER") {
    if (order.riderId && order.riderId !== req.user.id) {
      res.status(403).json({ error: "Order is already claimed by another rider." });
      return;
    }
    extraData.riderId = req.user.id;
  }

  if (req.user.role === "RIDER" && ["OUT_FOR_DELIVERY", "DELIVERED"].includes(status)) {
    if (order.riderId !== req.user.id) {
       res.status(403).json({ error: "You cannot update an order assigned to someone else." });
       return;
    }
  }

  const updated = await prisma.order.update({
    where: { id },
    data: { status: status as "PAYMENT_PENDING" | "PENDING" | "ACCEPTED" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED", ...extraData },
    include: { orderItems: { select: ORDER_ITEM_SELECT } },
  });

  res.json({ order: formatOrder(updated) });
}

// POST /api/orders/:id/payment   body: { method: "COD" | "MOCK_UPI" | "MOCK_CARD" }
export async function processPayment(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new AuthError("Unauthenticated");

  const id = String(req.params.id);
  const { method } = req.body as { method?: string };

  if (!method || !["COD", "MOCK_UPI", "MOCK_CARD"].includes(method)) {
    res.status(400).json({ error: "Invalid payment method" });
    return;
  }

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) throw new OrderNotFoundError();

  if (order.customerId !== req.user.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  if (order.status !== "PAYMENT_PENDING") {
    res.status(400).json({ error: "Order is not pending payment" });
    return;
  }

  // Simulate payment delay
  if (method !== "COD") {
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.payment.create({
      data: {
        orderId: order.id,
        amount: order.total_amount,
        method,
        status: "SUCCESS",
        transactionId: method === "COD" ? null : `TXN_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      },
    });

    return tx.order.update({
      where: { id: order.id },
      data: { status: "PENDING" },
      include: { orderItems: { select: ORDER_ITEM_SELECT } },
    });
  });

  res.json({ order: formatOrder(updated) });
}

export async function submitOrderFeedback(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new AuthError("Unauthenticated");
  const { id } = req.params;
  const { rating, feedback } = req.body as { rating: number; feedback?: string };

  if (typeof rating !== "number" || rating < 1 || rating > 5) {
    res.status(400).json({ error: "Rating must be between 1 and 5" });
    return;
  }

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) throw new OrderNotFoundError(`Order ${id} not found`);

  if (order.customerId !== req.user.id && req.user.role !== "ADMIN") {
    throw new AuthError("Unauthorized to rate this order");
  }

  if (order.status !== "DELIVERED") {
    res.status(400).json({ error: "Can only rate delivered orders" });
    return;
  }

  const updated = await prisma.order.update({
    where: { id },
    data: { rating, feedback },
  });

  res.json({ success: true, order: formatOrder(updated) });
}
