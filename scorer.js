/**
 * FreightBot Pro — Moteur de scoring enrichi
 *
 * Score de 0 à 100 sur 5 critères :
 *   Prix/km        (30pts) — rendement financier
 *   Distance       (20pts) — optimisation du trajet
 *   Poids          (15pts) — utilisation capacité
 *   Disponibilité  (15pts) — urgence / délai
 *   Proximité      (20pts) — distance camion → chargement ← NOUVEAU
 */

const BENCHMARKS = {
  pricePerKm: { excellent: 2.5, good: 1.8, average: 1.4, poor: 1.0 },
  distKm:     { optimal: 550, good: 200, min: 50, max: 1200 },
  weightTons: { full: 20, good: 12, partial: 5 },
};

function scorePricePerKm(v) {
  if (!v || v <= 0) return 0;
  const { excellent, good, average, poor } = BENCHMARKS.pricePerKm;
  if (v >= excellent) return 30;
  if (v >= good)      return 22 + Math.round(8  * (v - good)    / (excellent - good));
  if (v >= average)   return 12 + Math.round(10 * (v - average) / (good - average));
  if (v >= poor)      return 3  + Math.round(9  * (v - poor)    / (average - poor));
  return 0;
}

function scoreDistance(d) {
  if (!d || d <= 0) return 0;
  if (d < 50)   return 2;
  if (d > 1200) return 8;
  const peak = 550;
  const dist = Math.abs(d - peak);
  return Math.max(5, Math.round(20 - (dist / 500) * 15));
}

function scoreWeight(w) {
  if (!w || w <= 0) return 0;
  const { full, good, partial } = BENCHMARKS.weightTons;
  if (w >= full)    return 15;
  if (w >= good)    return 9 + Math.round(6 * (w - good)    / (full - good));
  if (w >= partial) return 3 + Math.round(6 * (w - partial) / (good - partial));
  return 1;
}

function scoreAvailability(loadDateStr) {
  if (!loadDateStr) return 8;
  const diffH = (new Date(loadDateStr) - Date.now()) / 3_600_000;
  if (diffH < 0)   return 2;
  if (diffH <= 4)  return 15;
  if (diffH <= 12) return 12;
  if (diffH <= 24) return 10;
  if (diffH <= 48) return 7;
  if (diffH <= 72) return 4;
  return 2;
}

/**
 * Score de proximité camion → point de chargement (20pts)
 * @param {number} distToPickupKm — distance en km entre le camion et le chargement
 */
function scoreProximity(distToPickupKm) {
  if (distToPickupKm === null || distToPickupKm === undefined) return 10; // neutre si inconnu
  if (distToPickupKm <= 20)  return 20;
  if (distToPickupKm <= 50)  return 15;
  if (distToPickupKm <= 100) return 8;
  if (distToPickupKm <= 200) return 3;
  return 0;
}

/**
 * Calcule la distance km entre deux coords GPS (haversine)
 */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

/**
 * Génère les tags automatiques de l'offre
 */
function generateTags(offer, distToPickupKm) {
  const tags = [];
  if (offer.pricePerKm >= 2.5)       tags.push("Meilleur prix/km");
  else if (offer.pricePerKm >= 1.8)  tags.push("Bon tarif");
  else if (offer.pricePerKm < 1.4)   tags.push("Prix bas");

  if (offer.distKm >= 400 && offer.distKm <= 700) tags.push("Distance optimale");
  else if (offer.distKm > 700)  tags.push("Long trajet");
  else if (offer.distKm < 150)  tags.push("Court trajet");

  if (distToPickupKm !== null && distToPickupKm <= 30) tags.push("Camion à proximité");
  if (offer.weightTons >= 20) tags.push("Chargement complet");

  return tags.slice(0, 3);
}

/**
 * Score une offre pour UN camion spécifique
 * @param {object} offer   — offre normalisée
 * @param {object} vehicle — véhicule { lat, lon, availableAt, baseLat, baseLon, weightCapacity }
 * @param {object} prefs   — préférences utilisateur
 */
function scoreOfferForVehicle(offer, vehicle = null, prefs = {}) {
  let distToPickupKm = null;

  // Calcul distance camion → point de chargement
  if (vehicle?.lat && vehicle?.lon && offer.loadingLat && offer.loadingLon) {
    distToPickupKm = Math.round(haversineKm(vehicle.lat, vehicle.lon, offer.loadingLat, offer.loadingLon));
  }

  const points = {
    pricePerKm:   scorePricePerKm(offer.pricePerKm),
    distance:     scoreDistance(offer.distKm),
    weight:       scoreWeight(offer.weightTons),
    availability: scoreAvailability(offer.loadDate),
    proximity:    scoreProximity(distToPickupKm),
  };

  let score = Object.values(points).reduce((a, b) => a + b, 0);

  // Bonus retour base : la destination rapproche-t-elle le camion de sa base ?
  if (vehicle?.baseLat && vehicle?.baseLon && offer.unloadingLat && offer.unloadingLon) {
    const distToBase = haversineKm(offer.unloadingLat, offer.unloadingLon, vehicle.baseLat, vehicle.baseLon);
    if (distToBase < 100) { score += 5; }
  }

  // Bonus zone préférée
  if (prefs.preferredZones?.length) {
    const zone = (offer.from + " " + offer.to).toLowerCase();
    if (prefs.preferredZones.some(z => zone.includes(z.toLowerCase()))) score += 3;
  }

  const final = Math.min(100, Math.round(score));

  let scoreLabel, scoreColor;
  if (final >= 90)      { scoreLabel = "Excellent"; scoreColor = "#16a34a"; }
  else if (final >= 80) { scoreLabel = "Très bon";  scoreColor = "#15803d"; }
  else if (final >= 70) { scoreLabel = "Bon";       scoreColor = "#d97706"; }
  else if (final >= 55) { scoreLabel = "Correct";   scoreColor = "#b45309"; }
  else                  { scoreLabel = "Moyen";     scoreColor = "#dc2626"; }

  return {
    ...offer,
    score: final,
    scoreLabel,
    scoreColor,
    scoreDetails: points,
    distToPickupKm,
    tags: generateTags(offer, distToPickupKm),
    vehicleId: vehicle?.id || null,
  };
}

/**
 * Score un tableau d'offres (sans véhicule spécifique)
 */
function scoreOffers(offers, prefs = {}) {
  return offers
    .map(o => scoreOfferForVehicle(o, null, prefs))
    .sort((a, b) => b.score - a.score);
}

/**
 * Matching intelligent : associe chaque offre au meilleur véhicule disponible
 * @param {Array} offers   — offres normalisées
 * @param {Array} vehicles — véhicules de la flotte
 * @param {object} prefs
 * @returns {Array} offres scorées avec le meilleur véhicule associé
 */
function matchOffersToVehicles(offers, vehicles = [], prefs = {}) {
  if (!vehicles.length) return scoreOffers(offers, prefs);

  const availableVehicles = vehicles.filter(v => v.status === "Disponible");

  return offers.map(offer => {
    if (!availableVehicles.length) return scoreOfferForVehicle(offer, null, prefs);

    // Trouver le meilleur véhicule pour cette offre
    const scored = availableVehicles.map(v => scoreOfferForVehicle(offer, v, prefs));
    const best = scored.sort((a, b) => b.score - a.score)[0];
    return best;
  }).sort((a, b) => b.score - a.score);
}

module.exports = { scoreOffer: scoreOfferForVehicle, scoreOffers, matchOffersToVehicles };
