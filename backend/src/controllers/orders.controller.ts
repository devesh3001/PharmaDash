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

  const { items } = req.body as { items?: OrderItemInput[] };
  const customerId = req.user.id;

  if (!Array.isArray(items) || items.length === 0) {
    throw new CheckoutValidationError("items must be a non-empty array");
  }
  const merged = mergeQuantities(items);
  const medicineIds = [...merged.keys()];

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
          status: "PENDING",
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

  // Admins and riders see all orders; customers see only theirs
  const isAdmin = req.user.role === "ADMIN";
  const where = {
    ...(isAdmin ? {} : { customerId: req.user.id }),
    ...(statusFilter ? { status: statusFilter } : {}),
  };

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
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
      error: "Invalid status. Must be one of: PENDING, ACCEPTED, OUT_FOR_DELIVERY, DELIVERED, CANCELLED",
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

  const updated = await prisma.order.update({
    where: { id },
    data: { status: status as "PENDING" | "ACCEPTED" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED" },
    include: { orderItems: { select: ORDER_ITEM_SELECT } },
  });

  res.json({ order: formatOrder(updated) });
}
