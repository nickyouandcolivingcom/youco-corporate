import express from "express";
import path from "path";
import { setupAuth } from "./auth.js";
import authRouter from "./routes/auth.js";
import usersRouter from "./routes/users.js";
import suppliersRouter from "./routes/suppliers.js";
import portfolioRouter from "./routes/portfolio.js";

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET is required");
}

const app = express();

app.set("trust proxy", 1);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

setupAuth(app);

// ─── API routes ───────────────────────────────────────────────────────────────
app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/suppliers", suppliersRouter);
app.use("/api/portfolio", portfolioRouter);

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
