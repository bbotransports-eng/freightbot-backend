require("dotenv").config();
const express = require("express");
const cors = require("cors");
const logger = require("./logger");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: [
    process.env.FRONTEND_URL || "http://localhost:5173",
    /\.lovable\.app$/,
    "http://localhost:3000",
    "http://localhost:5173",
  ],
  credentials: true,
}));

app.use(express.json());

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

const routes = require("./routes");
app.use("/api", routes);

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: Math.round(process.uptime()),
    env: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  logger.info(`FreightBot Backend démarré sur le port ${PORT}`);
});

module.exports = app;
