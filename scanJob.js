const cron = require("node-cron");
const { getMockOffers } = require("./mockData");
const { scoreOffers, matchOffersToVehicles } = require("./scorer");
const { getCredentials } = require("./credentialsVault");
const { getFleet } = require("./fleetStore");
const { enrichOffersWithCoords } = require("./geocoder");
const logger = require("./logger");

const IS_MOCK  = process.env.MOCK_MODE === "true";
const INTERVAL = parseInt(process.env.SCAN_INTERVAL_MINUTES || "8");

const offersCache = new Map();
const botLogs     = [];
const botStatus   = new Map();
const cronTasks   = new Map();

function addLog(userId, msg, type = "info") {
  const now  = new Date();
  const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
  botLogs.push({ time, msg, type, userId });
  if (botLogs.length > 50) botLogs.shift();
  logger.info(`[Bot][${userId}] ${msg}`);
}

async function runScanForUser(userId, filters = {}) {
  botStatus.set(userId, { running: true, lastScan: new Date().toISOString() });
  let rawOffers = [];
  try {
    if (IS_MOCK) {
      addLog(userId, "Mode mock — données de test", "info");
      rawOffers = await getMockOffers(filters);
      addLog(userId, `${rawOffers.length} offres mock générées`, "ok");
    } else {
      const creds = getCredentials(userId, "transeu");
      if (!creds) { addLog(userId, "Aucun compte connecté", "error"); return; }
      const { fetchTransEuOffers } = require("./transeu");
      rawOffers = await fetchTransEuOffers(creds.username, creds.password, userId, filters);
      addLog(userId, `${rawOffers.length} offres récupérées`, "ok");
    }

    addLog(userId, "Géocodage des villes…", "info");
    const enriched = await enrichOffersWithCoords(rawOffers);

    const fleet = getFleet(userId);
    const available = fleet.filter(v => v.status === "Disponible");

    let scored;
    if (available.length > 0) {
      addLog(userId, `Matching avec ${available.length} véhicule(s) disponible(s)…`, "info");
      scored = matchOffersToVehicles(enriched, available, filters.userPrefs || {});
      addLog(userId, "Matching proximité camion appliqué ✓", "ok");
    } else {
      scored = scoreOffers(enriched, filters.userPrefs || {});
    }

    const top = scored.filter(o => o.score >= 80);
    addLog(userId, `Scoring IA : ${top.length} offres score ≥ 80`, "ok");

    if (top.length > 0) {
      const best = top[0];
      const prox = best.distToPickupKm !== null ? ` | camion à ${best.distToPickupKm}km` : "";
      addLog(userId, `⚡ ${best.from} → ${best.to} | score ${best.score}${prox}`, "alert");
    }

    const validPrices = scored.filter(o => o.pricePerKm);
    offersCache.set(userId, {
      offers: scored,
      lastUpdate: new Date().toISOString(),
      stats: {
        total:             scored.length,
        topCount:          top.length,
        avgScore:          Math.round(scored.reduce((a, o) => a + o.score, 0) / (scored.length || 1)),
        avgPricePerKm:     validPrices.length ? Math.round(validPrices.reduce((a, o) => a + o.pricePerKm, 0) / validPrices.length * 100) / 100 : 0,
        availableVehicles: available.length,
      },
    });

  } catch (err) {
    addLog(userId, `Erreur : ${err.message}`, "error");
    logger.error(err.stack);
  } finally {
    const nextScan = new Date(Date.now() + INTERVAL * 60 * 1000).toISOString();
    botStatus.set(userId, { running: false, lastScan: new Date().toISOString(), nextScan });
    addLog(userId, `Prochain scan dans ${INTERVAL} min`, "wait");
  }
}

function startBotForUser(userId, filters = {}) {
  const key = `${userId}:transeu`;
  if (cronTasks.has(key)) { cronTasks.get(key).stop(); cronTasks.delete(key); }
  addLog(userId, `Bot démarré (${IS_MOCK ? "mock" : "réel"}) — toutes les ${INTERVAL} min`, "ok");
  runScanForUser(userId, filters);
  const task = cron.schedule(`*/${INTERVAL} * * * *`, () => runScanForUser(userId, filters));
  cronTasks.set(key, task);
  return task;
}

function stopBotForUser(userId) {
  const key = `${userId}:transeu`;
  if (cronTasks.has(key)) { cronTasks.get(key).stop(); cronTasks.delete(key); }
  addLog(userId, "Bot arrêté", "info");
}

function getOffersForUser(userId)  { return offersCache.get(userId) || { offers: [], lastUpdate: null, stats: {} }; }
function getBotLogsForUser(userId) { return botLogs.filter(l => l.userId === userId).slice(-30); }
function getBotStatus(userId)      { return botStatus.get(userId) || { running: false, lastScan: null }; }

module.exports = { startBotForUser, stopBotForUser, runScanForUser, getOffersForUser, getBotLogsForUser, getBotStatus };
