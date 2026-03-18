const express = require("express");
const router = express.Router();
const { storeCredentials, removeCredentials, hasCredentials } = require("../services/credentialsVault");
const { startBotForUser, stopBotForUser, runScanForUser, getOffersForUser, getBotLogsForUser, getBotStatus } = require("../jobs/scanJob");

const IS_MOCK = process.env.MOCK_MODE === "true";

// ─── CONNEXION BOURSE ─────────────────────────────────────────────────────────

/**
 * POST /api/connect
 * Body: { userId, bourseId, username, password }
 * Connecte un compte bourse et démarre le bot
 */
router.post("/connect", async (req, res) => {
  const { userId, bourseId, username, password, filters } = req.body;

  if (!userId || !bourseId) {
    return res.status(400).json({ error: "Champs manquants : userId, bourseId" });
  }

  // En mode mock, les credentials sont optionnels
  if (!IS_MOCK && (!username || !password)) {
    return res.status(400).json({ error: "Champs manquants : username, password" });
  }

  if (bourseId !== "transeu") {
    return res.status(400).json({ error: "Seule Trans.eu est supportée pour l'instant" });
  }

  if (!IS_MOCK) {
    storeCredentials(userId, bourseId, username, password);
  }

  startBotForUser(userId, filters || {});

  res.json({
    success: true,
    message: `Compte ${bourseId} connecté, bot démarré${IS_MOCK ? " (mode mock)" : ""}`,
    userId,
    bourseId,
    mock: IS_MOCK,
  });
});

/**
 * POST /api/disconnect
 * Body: { userId, bourseId }
 */
router.post("/disconnect", (req, res) => {
  const { userId, bourseId } = req.body;
  removeCredentials(userId, bourseId);
  stopBotForUser(userId);
  res.json({ success: true, message: `Déconnecté de ${bourseId}` });
});

/**
 * GET /api/status/:userId
 * Retourne le statut de connexion et du bot
 */
router.get("/status/:userId", (req, res) => {
  const { userId } = req.params;
  const connected = hasCredentials(userId, "transeu");
  const botStat = getBotStatus(userId);

  res.json({
    userId,
    bourses: {
      transeu: {
        connected,
        botRunning: botStat.running,
        lastScan: botStat.lastScan,
        nextScan: botStat.nextScan,
      },
    },
  });
});

// ─── OFFRES ───────────────────────────────────────────────────────────────────

/**
 * GET /api/offers/:userId
 * Retourne les dernières offres scorées
 * Query params: ?minScore=80&maxResults=20&bourse=transeu
 */
router.get("/offers/:userId", (req, res) => {
  const { userId } = req.params;
  const { minScore = 0, maxResults = 50 } = req.query;

  const data = getOffersForUser(userId);
  const filtered = data.offers
    .filter(o => o.score >= parseInt(minScore))
    .slice(0, parseInt(maxResults));

  res.json({
    offers: filtered,
    stats: data.stats,
    lastUpdate: data.lastUpdate,
  });
});

/**
 * POST /api/scan/:userId
 * Force un scan immédiat (hors cron)
 */
router.post("/scan/:userId", async (req, res) => {
  const { userId } = req.params;
  const { filters } = req.body;

  if (!hasCredentials(userId, "transeu")) {
    return res.status(400).json({ error: "Aucun compte Trans.eu connecté pour cet utilisateur" });
  }

  // Lance en arrière-plan
  runScanForUser(userId, filters || {}).catch(console.error);

  res.json({ success: true, message: "Scan lancé en arrière-plan" });
});

// ─── LOGS BOT ─────────────────────────────────────────────────────────────────

/**
 * GET /api/logs/:userId
 * Retourne les derniers logs du bot (polling depuis le frontend)
 */
router.get("/logs/:userId", (req, res) => {
  const { userId } = req.params;
  const logs = getBotLogsForUser(userId);
  res.json({ logs });
});

module.exports = router;
