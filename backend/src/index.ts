import express from "express";
import cors from "cors";
import { prisma } from "./db/prisma";

// Routers
import { authRouter } from "./routes/auth.routes";
import { medicinesRouter } from "./routes/medicines.routes";
import { ordersRouter } from "./routes/orders.routes";
import { inventoryRouter } from "./routes/inventory.routes";
import { pharmaciesRouter } from "./routes/pharmacies.routes";
import { usersRouter } from "./routes/users.routes";

// Custom error classes
import {
  CheckoutValidationError,
  InsufficientStockError,
  OrderNotFoundError,
} from "./controllers/orders.controller";
import { AuthError } from "./middleware/auth.middleware";
import { AuthValidationError } from "./controllers/auth.controller";
import { InventoryValidationError } from "./controllers/inventory.controller";

const app = express();
const PORT = Number(process.env.PORT) || 8080;

// ─── Middleware ────────────────────────────────────────────────────────────────

app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:3000"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(express.json());

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get("/health", async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.use("/api/auth", authRouter);
app.use("/api/medicines", medicinesRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/pharmacies", pharmaciesRouter);
app.use("/api/users", usersRouter);

// ─── Global Error Handler ─────────────────────────────────────────────────────

app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof AuthError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    if (err instanceof AuthValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof InsufficientStockError) {
      res.status(409).json({ error: err.message });
      return;
    }
    if (err instanceof CheckoutValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof OrderNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof InventoryValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  },
);

// ─── Server Lifecycle ─────────────────────────────────────────────────────────

const server = app.listen(PORT, () => {
  console.log(`\n🚀 PharmaDash API — http://localhost:${PORT}`);
  console.log(`   Health:     GET  /health`);
  console.log(`   Auth:       POST /api/auth/register  |  POST /api/auth/login`);
  console.log(`   Medicines:  GET  /api/medicines`);
  console.log(`   Pharmacies: GET  /api/pharmacies`);
  console.log(`   Orders:     POST /api/orders  |  GET /api/orders`);
  console.log(`   Inventory:  GET  /api/inventory  (ADMIN)`);
  console.log(`   Users:      GET  /api/users/me\n`);
});

async function shutdown(signal: string) {
  console.log(`${signal} received, closing server and Prisma client…`);
  server.close(() => void 0);
  await prisma.$disconnect();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
