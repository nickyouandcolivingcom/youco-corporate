import express from "express";
import path from "path";
import { setupAuth } from "./auth.js";
import authRouter from "./routes/auth.js";
import usersRouter from "./routes/users.js";
import suppliersRouter from "./routes/suppliers.js";
import portfolioRouter from "./routes/portfolio.js";
import energyRouter from "./routes/energy.js";
import energyInvoicesRouter from "./routes/energy-invoices.js";
import octopusRouter from "./routes/octopus.js";
import docsRouter from "./routes/docs.js";
import energyPdfImportRouter from "./routes/energy-pdf-import.js";
import waterRouter from "./routes/water.js";
import waterInvoicesRouter from "./routes/water-invoices.js";

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET is required");
}

const app = express();

app.set("trust proxy", 1);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: false, limit: "50mb" }));

setupAuth(app);

// ─── API routes ───────────────────────────────────────────────────────────────
app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/suppliers", suppliersRouter);
app.use("/api/portfolio", portfolioRouter);
app.use("/api/energy", energyRouter);
app.use("/api/energy-invoices", energyInvoicesRouter);
app.use("/api/energy-pdf-import", energyPdfImportRouter);
app.use("/api/octopus", octopusRouter);
app.use("/api/water", waterRouter);
app.use("/api/water-invoices", waterInvoicesRouter);
app.use("/api/docs", docsRouter);

// ─── Serve frontend in production ─────────────────────────────────────────────
if (process.env.NODE_ENV === "production") {
  const distPath = path.join(process.cwd(), "dist", "public");
  app.use(express.static(distPath));
  app.get("/{*path}", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

const PORT = parseInt(process.env.PORT ?? "5000", 10);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`youco-corporate running on port ${PORT}`);
});

export default app;
