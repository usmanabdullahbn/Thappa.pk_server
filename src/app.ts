import express, { Request, Response } from "express";
import cors from "cors";
import morgan from "morgan";
import { env } from "./config/env";
import { errorHandler } from "./middleware/errorHandler";

import authRoutes from "./modules/auth/auth.routes";
import adminRoutes from "./modules/admin/admin.routes";
import businessRoutes from "./modules/business/business.routes";
import customerRoutes from "./modules/customer/customer.routes";

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.clientOrigin.split(","), credentials: true }));
  app.use(express.json({ limit: "2mb" }));
  app.use(morgan(env.nodeEnv === "development" ? "dev" : "combined"));

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", service: "thappa-backend", time: new Date().toISOString() });
  });

  app.use("/v1/auth", authRoutes);
  app.use("/v1/admin", adminRoutes);
  app.use("/v1/business", businessRoutes);
  app.use("/v1/customer", customerRoutes);

  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.path}` } });
  });

  app.use(errorHandler);

  return app;
}
