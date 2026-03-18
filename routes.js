const express = require("express");
const router = express.Router();
const { storeCredentials, removeCredentials, hasCredentials } = require("./credentialsVault");
const { startBotForUser, stopBotForUser, runScanForUser, getOffersForUser, getBotLogsForUser, getBotStatus } = require("./scanJob");

const IS_MOCK = process.env.MOCK_MODE === "true";

router.post("/connect", async (req, res) => {
  const { userId, bourseId, username, password, filters } = req.body;
  if (!userId || !bourseId) {
    return res.status(400).json({ error: "Champs manquants : userId, bourseId" });
  }
  if (!IS_MOCK && (!username || !password)) {
    return res.status(400).json({ error: "Champs manquants : username, password" });
  }
  if (!IS_MOCK) {
    storeCredentials(userId, bourseId, username, password);
  }
  startBotForUser(userId, filters || {});
  res.json({ success: true, message: `Compte ${bourseId} connecté`, mock: IS_MOCK });
});

router.post("/disconnect", (req, res) => {
  const { userId, bourseId } = req.body;
  removeCredentials(userId, bourseId);
  stopBotForUser(userId);
  res.json({ success: true, message: `Déconnecté de ${bourseId}` });
});

router.get("/status/:userId", (req, res) => {
  const { userId } = req.params;
  const connected = hasCredentials(userId, "transeu");
  const botStat = getBotStatus(userId);
  res.json({ userId, bourses: { transeu: { connected, ...botStat } } });
});

router.get("/offers/:userId", (req, res) => {
  const { userId } = req.params;
  const { minScore = 0, maxResults = 50 } = req.query;
  const data = getOffersForUser(userId);
  const filtered = data.offers.filter(o => o.score >= parseInt(minScore)).slice(0, parseInt(maxResults));
  res.json({ offers: filtered, stats: data.stats, lastUpdate: data.lastUpdate });
});

router.post("/scan/:userId", async (req, res) => {
  const { userId } = req.params;
  runScanForUser(userId, {}).catch(console.error);
  res.json({ success: true, message: "Scan lancé" });
});

router.get("/logs/:userId", (req, res) => {
  const { userId } = req.params;
  res.json({ logs: getBotLogsForUser(userId) });
});

module.exports = router;
