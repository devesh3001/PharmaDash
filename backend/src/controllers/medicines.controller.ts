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

/**
 * Mocked AI OCR Scanner
 * In production, this would use Google Cloud Vision or OpenAI Vision API
 */
export async function scanPrescription(_req: Request, res: Response): Promise<void> {
  // Simulate network latency for "AI Analysis"
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Pick 2-3 random medicines that require prescription for the demo
  const medicines = await prisma.medicine.findMany({
    where: { requires_prescription: true },
    take: 3,
  });

  // Pick a random subset
  const count = Math.floor(Math.random() * 2) + 1; // 1 or 2
  const results = medicines.sort(() => 0.5 - Math.random()).slice(0, count);

  res.json({
    success: true,
    medicines: results.map(m => ({
      id: m.id,
      name: m.name,
      price: m.price.toString(),
      requires_prescription: m.requires_prescription
    }))
  });
}

