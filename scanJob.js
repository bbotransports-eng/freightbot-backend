const cron = require("node-cron");
const { fetchTransEuOffers } = require("../services/transeu");
const { getMockOffers }      = require("../services/mockData");
const { scoreOffers }        = require("../services/scorer");
const { getCredentials }     = require("../services/credentialsVault");
const logger                 = require("../services/logger");

const IS_MOCK  = process.env.MOCK_MODE === "true";
const INTERVAL = parseInt(process.env.SCAN_INTERVAL_MINUTES || "8");

// ── Stores ────────────────────────────────────────────────────────────────────
const offersCache = new Map();  // userId → { offers, stats, lastUpdate }
const botLogs     = [];         // entrées globales (max 50)
const botStatus   = new Map();  // userId → { running, lastScan, nextScan }
const cronTasks   = new Map();  // userId:bourseId → tâche cron

// ── Logs ──────────────────────────────────────────────────────────────────────
function addLog(userId, msg, type = "info") {
  const now  = new Date();
  const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
  const entry = { time, msg, type, userId };
  botLogs.push(entry);
  if (botLogs.length > 50) botLogs.shift();
  logger.info(`[Bot][${userId}] ${msg}`);
}

// ── Scan ──────────────────────────────────────────────────────────────────────
async function runScanForUser(userId, filters = {}) {
  botStatus.set(userId, { running: true, lastScan: new Date().toISOString() });

  let rawOffers = [];

  try {
    if (IS_MOCK) {
      // ── MODE MOCK (pas de clés API nécessaires) ──────────────────────────
      addLog(userId, "Mode mock activé — données de test", "info");
      rawOffers = await getMockOffers(filters);
      addLog(userId, `${rawOffers.length} offres mock générées`, "ok");

    } else {
      // ── MODE RÉEL ────────────────────────────────────────────────────────
      const creds = getCredentials(userId, "transeu");
      if (!creds) {
        addLog(userId, "Trans.eu : aucun compte connecté", "error");
        return;
      }
      addLog(userId, "Connexion Trans.eu en cours…", "info");
      rawOffers = await fetchTransEuOffers(creds.username, creds.password, userId, filters);
      addLog(userId, `${rawOffers.length} offres récupérées via API`, "ok");
    }

    // ── Scoring ──────────────────────────────────────────────────────────────
    const scored    = scoreOffers(rawOffers, filters.userPrefs || {});
    const topOffers = scored.filter(o => o.score >= 80);

    addLog(userId, `Scoring IA : ${topOffers.length} offres score ≥ 80`, "ok");

    if (topOffers.length > 0) {
      addLog(
        userId,
        `⚡ Alerte : ${topOffers[0].from} → ${topOffers[0].to} | score ${topOffers[0].score}`,
        "alert"
      );
    }

    // ── Cache ────────────────────────────────────────────────────────────────
    const validPrices = scored.filter(o => o.pricePerKm);
    offersCache.set(userId, {
      offers:     scored,
      lastUpdate: new Date().toISOString(),
      stats: {
        total:         scored.length,
        topCount:      topOffers.length,
        avgScore:      Math.round(scored.reduce((a, o) => a + o.score, 0) / (scored.length || 1)),
        avgPricePerKm: validPrices.length
          ? Math.round(validPrices.reduce((a, o) => a + o.pricePerKm, 0) / validPrices.length * 100) / 100
          : 0,
      },
    });

  } catch (err) {
    addLog(userId, `Erreur scan : ${err.message}`, "error");
    logger.error(`[Bot] ${err.stack}`);
  } finally {
    const nextScan = new Date(Date.now() + INTERVAL * 60 * 1000).toISOString();
    botStatus.set(userId, { running: false, lastScan: new Date().toISOString(), nextScan });
    addLog(userId, `Prochain scan dans ${INTERVAL} min`, "wait");
  }
}

// ── Cron ──────────────────────────────────────────────────────────────────────
function startBotForUser(userId, filters = {}) {
  const key      = `${userId}:transeu`;
  const cronExpr = `*/${INTERVAL} * * * *`;

  // Arrêter l'ancienne tâche si elle existe
  if (cronTasks.has(key)) {
    cronTasks.get(key).stop();
    cronTasks.delete(key);
  }

  addLog(userId, `Bot démarré (${IS_MOCK ? "mode mock" : "mode réel"}) — scan toutes les ${INTERVAL} min`, "ok");

  // Scan immédiat
  runScanForUser(userId, filters);

  // Puis cron régulier
  const task = cron.schedule(cronExpr, () => runScanForUser(userId, filters));
  cronTasks.set(key, task);
  return task;
}

function stopBotForUser(userId) {
  const key = `${userId}:transeu`;
  if (cronTasks.has(key)) {
    cronTasks.get(key).stop();
    cronTasks.delete(key);
    addLog(userId, "Bot arrêté", "info");
  }
}

// ── Getters pour l'API ────────────────────────────────────────────────────────
function getOffersForUser(userId)  { return offersCache.get(userId) || { offers: [], lastUpdate: null, stats: {} }; }
function getBotLogsForUser(userId) { return botLogs.filter(l => l.userId === userId).slice(-30); }
function getBotStatus(userId)      { return botStatus.get(userId) || { running: false, lastScan: null }; }

module.exports = { startBotForUser, stopBotForUser, runScanForUser, getOffersForUser, getBotLogsForUser, getBotStatus };
