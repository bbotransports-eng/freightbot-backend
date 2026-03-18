require("dotenv").config();
const express = require("express");
const cors = require("cors");
const routes = require("./api/routes");
const logger = require("./services/logger");

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middlewares ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || "http://localhost:5173",
    /\.lovable\.app$/,       // Tous les sous-domaines Lovable en dev
    "http://localhost:3000",
    "http://localhost:5173",
  ],
  credentials: true,
}));

app.use(express.json());

// Log chaque requête
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api", routes);

// Health check (utile pour Railway)
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: Math.round(process.uptime()),
    env: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// ── Lancement ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`FreightBot Backend démarré sur le port ${PORT}`);
  logger.info(`Health: http://localhost:${PORT}/health`);
});

module.exports = app;
