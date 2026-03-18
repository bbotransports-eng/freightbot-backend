/**
 * FreightBot Pro — Client API officielle Trans.eu
 *
 * Documentation : https://transeu.github.io/api-rest-documentation/
 * Auth : OAuth2 (flux "password" — token appartient à l'utilisateur)
 *
 * SETUP (une seule fois) :
 * 1. Enregistrer votre app sur https://www.trans.eu/api/
 *    ou en écrivant à api@trans.eu
 * 2. Récupérer CLIENT_ID, CLIENT_SECRET, API_KEY
 * 3. Les ajouter dans le fichier .env
 */

const logger = require("./logger");

const OAUTH_URL     = "https://auth.system.trans.eu/oauth2/token";
const OFFERS_HOST   = "https://offers.system.trans.eu";
const CLIENT_ID     = process.env.TRANSEU_CLIENT_ID;
const CLIENT_SECRET = process.env.TRANSEU_CLIENT_SECRET;
const API_KEY       = process.env.TRANSEU_API_KEY;

// Cache des tokens OAuth par userId
const tokenCache = new Map();

// ── OAuth2 ────────────────────────────────────────────────────────────────────

/**
 * Obtient un access_token OAuth2 via le flux "Resource Owner Password"
 * (l'utilisateur donne son login/pass Trans.eu une seule fois, FreightBot
 *  obtient un token en son nom — légal car c'est son compte)
 */
async function getAccessToken(username, password, userId) {
  const cached = tokenCache.get(userId);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.accessToken;
  }

  logger.info(`[Trans.eu] Obtention token OAuth pour ${username}`);

  const body = new URLSearchParams({
    grant_type:    "password",
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    username,
    password,
    scope:         "offers.loads.manage offers.loads.basic",
  });

  const res = await fetch(OAUTH_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OAuth Trans.eu échoué (${res.status}): ${err}`);
  }

  const data = await res.json();
  tokenCache.set(userId, {
    accessToken: data.access_token,
    expiresAt:   Date.now() + (data.expires_in || 3600) * 1000,
  });

  logger.info("[Trans.eu] Token OAuth obtenu");
  return data.access_token;
}

function invalidateToken(userId) {
  tokenCache.delete(userId);
}

// ── Fetch offres ──────────────────────────────────────────────────────────────

/**
 * Récupère les offres de fret via l'API REST officielle Trans.eu
 *
 * @param {string} username
 * @param {string} password
 * @param {string} userId          - ID interne FreightBot (pour cache token)
 * @param {object} filters
 * @param {string} filters.fromCountry    - ex: "FR"
 * @param {string} filters.toCountry      - ex: "FR"
 * @param {number} filters.minWeightTons  - ex: 10
 * @param {number} filters.maxWeightTons  - ex: 24
 * @param {number} filters.minPrice       - ex: 500 (EUR)
 * @param {string} filters.currency       - ex: "EUR"
 * @param {number} filters.page           - défaut: 1
 * @returns {Promise<Array>} Offres normalisées au format FreightBot
 */
async function fetchTransEuOffers(username, password, userId, filters = {}) {
  const token = await getAccessToken(username, password, userId);

  // ── Filtre style MongoDB (syntaxe Trans.eu) ──────────────────────────────
  const mongoFilter = { type: { $in: ["public"] } };

  if (filters.fromCountry)
    mongoFilter["loading_place.address.country"]   = filters.fromCountry.toUpperCase();
  if (filters.toCountry)
    mongoFilter["unloading_place.address.country"] = filters.toCountry.toUpperCase();

  if (filters.minWeightTons || filters.maxWeightTons) {
    mongoFilter["load_weight.value"] = {};
    if (filters.minWeightTons) mongoFilter["load_weight.value"].$gte = filters.minWeightTons;
    if (filters.maxWeightTons) mongoFilter["load_weight.value"].$lte = filters.maxWeightTons;
  }

  if (filters.minPrice) {
    mongoFilter.price = { $gte: filters.minPrice };
    if (filters.currency) mongoFilter.price_currency = filters.currency.toUpperCase();
  }

  const params = new URLSearchParams({
    filter: JSON.stringify(mongoFilter),
    sort:   JSON.stringify({ creation_date: -1 }),
    page:   String(filters.page || 1),
  });

  const url = `${OFFERS_HOST}/api/rest/v1/loads?${params}`;
  logger.info(`[Trans.eu] GET ${url.slice(0, 100)}…`);

  const res = await fetch(url, {
    headers: {
      "Accept":        "application/hal+json",
      "Authorization": `Bearer ${token}`,
      "Api-key":       API_KEY,
    },
  });

  // Token expiré → invalider cache et remonter l'erreur pour retry
  if (res.status === 401) {
    invalidateToken(userId);
    throw new Error("Token expiré — relancer le scan");
  }

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API Trans.eu (${res.status}): ${err}`);
  }

  const data = await res.json();
  const raw  = data?._embedded?.loads || [];
  logger.info(`[Trans.eu] ${raw.length} offres reçues`);

  return raw.map(normalizeOffer).filter(Boolean);
}

// ── Normalisation ─────────────────────────────────────────────────────────────

/**
 * Convertit une offre HAL+JSON Trans.eu au format standard FreightBot
 *
 * Structure brute Trans.eu :
 * {
 *   id: 123456789,
 *   loading_place:   { address: { country, locality, postal_code }, geo: { latitude, longitude } },
 *   unloading_place: { address: { ... }, geo: { ... } },
 *   loading_date:    "2024-06-10T08:00:00+0000",
 *   load_weight:     { value: 18, unit_code: "TNE" },
 *   price:           920,
 *   price_currency:  "EUR",
 *   is_ltl:          false,
 *   _embedded:       { company: { name: "Transport Dupont SA" } }
 * }
 */
function normalizeOffer(raw) {
  if (!raw?.loading_place?.address || !raw?.unloading_place?.address) return null;

  const fa = raw.loading_place.address;
  const ta = raw.unloading_place.address;

  // Format "Ville (dépt)" si dispo
  const fmt = (addr) => {
    const dept = addr.postal_code?.slice(0, 2);
    return addr.locality
      ? `${addr.locality}${dept ? ` (${dept})` : ""}`
      : addr.country;
  };

  const weightTons = raw.load_weight?.value  || null;
  const price      = raw.price               || null;

  // Distance via haversine si coords disponibles
  let distKm = null;
  if (raw.loading_place?.geo && raw.unloading_place?.geo) {
    distKm = Math.round(haversineKm(
      raw.loading_place.geo.latitude,
      raw.loading_place.geo.longitude,
      raw.unloading_place.geo.latitude,
      raw.unloading_place.geo.longitude,
    ));
  }

  return {
    id:          String(raw.id),
    bourse:      "Trans.eu",
    from:        fmt(fa),
    fromCountry: fa.country,
    to:          fmt(ta),
    toCountry:   ta.country,
    distKm,
    weightTons,
    loadType:    raw.is_ltl ? "Partiel (LTL)" : "Complet (FTL)",
    volume:      raw.load_volume?.value || null,
    price,
    currency:    raw.price_currency || "EUR",
    pricePerKm:  (price && distKm > 0)
                   ? Math.round((price / distKm) * 100) / 100
                   : null,
    loadDate:    raw.loading_date   || null,
    unloadDate:  raw.unloading_date || null,
    company:     raw._embedded?.company?.name || null,
    description: raw.description || null,
    scrapedAt:   new Date().toISOString(),
    score:       null, // rempli par scorer.js
  };
}

// ── Haversine ─────────────────────────────────────────────────────────────────
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function toRad(deg) { return deg * (Math.PI / 180); }

module.exports = { fetchTransEuOffers, invalidateToken };
