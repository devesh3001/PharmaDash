import type { Request, Response } from "express";
import { prisma } from "../db/prisma";

export class InventoryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InventoryValidationError";
  }
}

/** Narrow an Express query value to string | undefined */
function qs(val: unknown): string | undefined {
  return typeof val === "string" ? val : undefined;
}

// GET /api/inventory?pharmacyId=&page=&limit=
export async function listInventory(req: Request, res: Response): Promise<void> {
  const pharmacyId = qs(req.query.pharmacyId);
  const page  = Math.max(1,   parseInt(qs(req.query.page)  ?? "1",  10));
  const limit = Math.min(100, parseInt(qs(req.query.limit) ?? "20", 10));
  const skip  = (page - 1) * limit;

  const where = pharmacyId ? { pharmacyId } : {};

  const [items, total] = await Promise.all([
    prisma.inventory.findMany({
      where,
      skip,
      take: limit,
      include: {
        medicine: { select: { id: true, name: true, generic_name: true, price: true } },
        pharmacy: { select: { id: true, name: true } },
      },
      orderBy: [{ pharmacy: { name: "asc" } }, { medicine: { name: "asc" } }],
    }),
    prisma.inventory.count({ where }),
  ]);

  res.json({
    data: items.map((row) => ({
      id: row.id,
      stock_quantity: row.stock_quantity,
      pharmacy: row.pharmacy,
      medicine: {
        id: row.medicine.id,
        name: row.medicine.name,
        generic_name: row.medicine.generic_name,
        price: row.medicine.price.toString(),
      },
    })),
    meta: { total, page, limit, pages: Math.ceil(total / limit) },
  });
}

// GET /api/inventory/:id
export async function getInventoryItem(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);

  const row = await prisma.inventory.findUnique({
    where: { id },
    include: {
      medicine: true,
      pharmacy: { select: { id: true, name: true, latitude: true, longitude: true } },
    },
  });

  if (!row) {
    res.status(404).json({ error: "Inventory item not found" });
    return;
  }

  res.json({
    inventory: {
      id: row.id,
      stock_quantity: row.stock_quantity,
      pharmacy: row.pharmacy,
      medicine: {
        id: row.medicine.id,
        name: row.medicine.name,
        generic_name: row.medicine.generic_name,
        price: row.medicine.price.toString(),
        requires_prescription: row.medicine.requires_prescription,
      },
    },
  });
}

// PATCH /api/inventory/:id   body: { stock_quantity: number }
export async function updateStock(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  const { stock_quantity } = req.body as { stock_quantity?: unknown };

  if (
    stock_quantity === undefined ||
    !Number.isInteger(stock_quantity) ||
    (stock_quantity as number) < 0
  ) {
    throw new InventoryValidationError("stock_quantity must be a non-negative integer");
  }

  const existing = await prisma.inventory.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "Inventory item not found" });
    return;
  }

  const updated = await prisma.inventory.update({
    where: { id },
    data: { stock_quantity: stock_quantity as number },
    include: {
      medicine: { select: { id: true, name: true, generic_name: true } },
      pharmacy: { select: { id: true, name: true } },
    },
  });

  res.json({
    inventory: {
      id: updated.id,
      stock_quantity: updated.stock_quantity,
      pharmacy: updated.pharmacy,
      medicine: updated.medicine,
    },
  });
}
