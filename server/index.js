import "dotenv/config";
import express from "express";
import cors from "cors";
import authRoutes, { registerHandler } from "./routes/auth.js";
import entityRoutes from "./routes/entities.js";
import functionRoutes from "./routes/functions.js";
import { disconnectPrisma } from "./prisma.js";

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(cors({
  origin: process.env.CORS_ORIGIN || true,
  credentials: true,
}));
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/register", registerHandler);
app.use("/api/auth", authRoutes);
app.use("/api/entities", entityRoutes);
app.use("/api/functions", functionRoutes);

app.use((error, _req, res, _next) => {
  const uniqueTarget = Array.isArray(error.meta?.target) ? error.meta.target.join(", ") : "";
  const isUniqueConstraintError = error.code === "P2002";
  const status = isUniqueConstraintError ? 409 : (error.status || 500);
  const message = isUniqueConstraintError
    ? `${uniqueTarget || "Value"} is already registered`
    : (error.message || "Internal server error");
  if (status >= 500) {
    console.error(error.stack || error);
  }
  res.status(status).json({
    error: message,
    ...(status >= 500 && process.env.NODE_ENV !== "production" && error.stack ? { stack: error.stack } : {}),
  });
});

const server = app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});

const shutdown = async () => {
  server.close(async () => {
    await disconnectPrisma();
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
