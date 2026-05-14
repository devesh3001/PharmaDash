import { createServer } from "node:http";
import express from "express";
import path from "path";
import cors from "cors";
import { Server } from "socket.io";
import { prisma } from "./db/prisma";

// Routers
import { authRouter } from "./routes/auth.routes";
import { medicinesRouter } from "./routes/medicines.routes";
import { ordersRouter } from "./routes/orders.routes";
import { inventoryRouter } from "./routes/inventory.routes";
import { pharmaciesRouter } from "./routes/pharmacies.routes";
import { usersRouter } from "./routes/users.routes";
import { adminRouter } from "./routes/admin.routes";

// Custom error classes
import {
  CheckoutValidationError,
  InsufficientStockError,
  OrderNotFoundError,
} from "./controllers/orders.controller";
import { AuthError } from "./middleware/auth.middleware";
import { AuthValidationError } from "./controllers/auth.controller";
import { InventoryValidationError } from "./controllers/inventory.controller";

const PORT = Number(process.env.PORT) || 8080;
const app = express();

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
app.use("/api/admin", adminRouter);

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

// ─── Serve Frontend (Production) ──────────────────────────────────────────────
if (process.env.NODE_ENV === "production") {
  const frontendPath = path.join(__dirname, "../../customer-app/dist");
  app.use(express.static(frontendPath));

  app.get("*", (req, res, next) => {
    // Skip API routes
    if (req.path.startsWith("/api") || req.path.startsWith("/health")) return next();
    res.sendFile(path.join(frontendPath, "index.html"));
  });
}

// ─── HTTP + WebSockets (Socket.io) ───────────────────────────────────────────

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.NODE_ENV === "production" ? false : "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log(`[socket.io] connected: ${socket.id}`);

  socket.on("disconnect", (reason) => {
    console.log(`[socket.io] disconnected: ${socket.id} (${reason})`);
  });

  socket.on("join_tracking_room", (orderId: unknown) => {
    const id =
      typeof orderId === "string"
        ? orderId.trim()
        : orderId &&
            typeof orderId === "object" &&
            "orderId" in orderId &&
            typeof (orderId as { orderId: unknown }).orderId === "string"
          ? (orderId as { orderId: string }).orderId.trim()
          : "";
    if (!id) return;
    void socket.join(id);
  });

  socket.on("rider_location_update", (payload: unknown) => {
    if (!payload || typeof payload !== "object") return;
    const { orderId, lat, lng } = payload as { orderId?: unknown; lat?: unknown; lng?: unknown };
    if (typeof orderId !== "string" || !orderId.trim()) return;
    if (typeof lat !== "number" || typeof lng !== "number" || Number.isNaN(lat) || Number.isNaN(lng)) {
      return;
    }
    socket.to(orderId.trim()).emit("location_update", { lat, lng });
  });
});

// ─── Server Lifecycle ─────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`\n🚀 PharmaDash API — http://localhost:${PORT}`);
  console.log(`   Socket.io:  same port (CORS: http://localhost:5173)`);
  console.log(`   Health:     GET  /health`);
  console.log(`   Auth:       POST /api/auth/register  |  POST /api/auth/login`);
  console.log(`   Medicines:  GET  /api/medicines`);
  console.log(`   Pharmacies: GET  /api/pharmacies`);
  console.log(`   Orders:     POST /api/orders  |  GET /api/orders`);
  console.log(`   Inventory:  GET  /api/inventory  (ADMIN)`);
  console.log(`   Users:      GET  /api/users/me\n`);
});

async function shutdown(signal: string) {
  console.log(`${signal} received, closing Socket.io, HTTP server, and Prisma…`);
  await new Promise<void>((resolve) => {
    io.close(() => resolve());
  });
  httpServer.close(() => void 0);
  await prisma.$disconnect();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
