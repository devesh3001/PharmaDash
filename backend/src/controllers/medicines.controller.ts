import type { Request, Response } from "express";
import { prisma } from "../db/prisma";

export async function listMedicines(_req: Request, res: Response): Promise<void> {
  const medicines = await prisma.medicine.findMany({
    orderBy: { name: "asc" },
    include: {
      inventory: {
        select: { stock_quantity: true },
      },
    },
  });

  res.json({
    medicines: medicines.map((m) => ({
      id: m.id,
      name: m.name,
      generic_name: m.generic_name,
      price: m.price.toString(),
      requires_prescription: m.requires_prescription,
      stock_quantity: m.inventory.reduce((sum, row) => sum + row.stock_quantity, 0),
    })),
  });
}
