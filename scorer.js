/**
 * FreightBot Pro — Moteur de scoring des offres de fret
 *
 * Score de 0 à 100 calculé sur 4 critères pondérés :
 *   - Prix au km       (40 pts) : rendement financier
 *   - Distance         (25 pts) : optimisation du temps
 *   - Poids            (20 pts) : utilisation de la capacité
 *   - Disponibilité    (15 pts) : urgence / délai de chargement
 */

// Seuils de référence marché transport routier France
const BENCHMARKS = {
  pricePerKm: {
    excellent: 2.5,   // > 2.50 €/km = très bon
    good:      1.8,   // > 1.80 €/km = bon
    average:   1.4,   // > 1.40 €/km = correct
    poor:      1.0,   // < 1.00 €/km = à éviter
  },
  distKm: {
    optimal:   400,   // 400-700 km = idéal (bonne rentabilité, pas trop long)
    good:      200,
    min:        50,
    max:      1200,
  },
  weightTons: {
    full:       20,   // > 20T = chargement complet = top
    good:       12,
    partial:     5,
  },
};

/**
 * Score le prix au km (40 points max)
 */
function scorePricePerKm(pricePerKm) {
  if (!pricePerKm || pricePerKm <= 0) return 0;
  const { excellent, good, average, poor } = BENCHMARKS.pricePerKm;

  if (pricePerKm >= excellent) return 40;
  if (pricePerKm >= good)      return 30 + Math.round(10 * (pricePerKm - good) / (excellent - good));
  if (pricePerKm >= average)   return 18 + Math.round(12 * (pricePerKm - average) / (good - average));
  if (pricePerKm >= poor)      return 5  + Math.round(13 * (pricePerKm - poor) / (average - poor));
  return 0;
}

/**
 * Score la distance (25 points max)
 */
function scoreDistance(distKm) {
  if (!distKm || distKm <= 0) return 0;
  const { optimal, good, min, max } = BENCHMARKS.distKm;

  if (distKm < min)  return 2;   // trop court, pas rentable
  if (distKm > max)  return 10;  // trop long, fatigue conducteur

  // Zone optimale 400–700 km = maximum
  if (distKm >= good && distKm <= max) {
    const peak = 550; // centre de la zone optimale
    const dist = Math.abs(distKm - peak);
    return Math.round(25 - (dist / 400) * 15);
  }

  // Zone correcte 200–400 km
  if (distKm >= good) return Math.round(15 + 10 * (distKm - good) / (optimal - good));

  // Zone courte < 200 km
  return Math.round(5 + 10 * (distKm - min) / (good - min));
}

/**
 * Score le poids (20 points max)
 */
function scoreWeight(weightTons) {
  if (!weightTons || weightTons <= 0) return 0;
  const { full, good, partial } = BENCHMARKS.weightTons;

  if (weightTons >= full) return 20;
  if (weightTons >= good) return 12 + Math.round(8 * (weightTons - good) / (full - good));
  if (weightTons >= partial) return 4 + Math.round(8 * (weightTons - partial) / (good - partial));
  return 2;
}

/**
 * Score la disponibilité (15 points max)
 * Plus c'est proche dans le temps, mieux c'est (délai de chargement court)
 */
function scoreAvailability(loadDateStr) {
  if (!loadDateStr) return 8; // score neutre si inconnu

  const now = new Date();
  const loadDate = new Date(loadDateStr);
  const diffHours = (loadDate - now) / (1000 * 60 * 60);

  if (diffHours < 0)    return 2;  // déjà passé
  if (diffHours <= 4)   return 15; // dans les 4 prochaines heures
  if (diffHours <= 12)  return 12; // aujourd'hui
  if (diffHours <= 24)  return 10; // demain
  if (diffHours <= 48)  return 7;  // après-demain
  if (diffHours <= 72)  return 4;  // dans 3 jours
  return 2;                         // trop loin
}

/**
 * Génère les tags descriptifs de l'offre
 */
function generateTags(offer) {
  const tags = [];

  if (offer.pricePerKm >= BENCHMARKS.pricePerKm.excellent) tags.push("Meilleur prix/km");
  else if (offer.pricePerKm >= BENCHMARKS.pricePerKm.good) tags.push("Bon tarif");
  else if (offer.pricePerKm < BENCHMARKS.pricePerKm.average) tags.push("Prix bas");

  if (offer.distKm >= 400 && offer.distKm <= 700) tags.push("Distance optimale");
  else if (offer.distKm > 700) tags.push("Long trajet");
  else if (offer.distKm < 150) tags.push("Court trajet");

  if (offer.weightTons >= BENCHMARKS.weightTons.full) tags.push("Chargement complet");
  if (offer.loadType === "Complet" || offer.loadType === "FTL") tags.push("FTL");
  if (offer.loadType === "Partiel" || offer.loadType === "LTL") tags.push("LTL");

  return tags.slice(0, 3); // max 3 tags
}

/**
 * Score une offre unique
 * @param {object} offer - Offre normalisée
 * @param {object} userPrefs - Préférences utilisateur (optionnel)
 * @returns {object} Offre enrichie avec score, label, tags
 */
function scoreOffer(offer, userPrefs = {}) {
  const points = {
    pricePerKm:   scorePricePerKm(offer.pricePerKm),
    distance:     scoreDistance(offer.distKm),
    weight:       scoreWeight(offer.weightTons),
    availability: scoreAvailability(offer.loadDate),
  };

  const totalScore = Object.values(points).reduce((a, b) => a + b, 0);
  const score = Math.min(100, Math.round(totalScore));

  // Bonus si correspond aux zones préférées du transporteur
  let bonus = 0;
  if (userPrefs.preferredZones?.length) {
    const offerZone = (offer.from + " " + offer.to).toLowerCase();
    if (userPrefs.preferredZones.some(z => offerZone.includes(z.toLowerCase()))) {
      bonus = 5;
    }
  }

  const finalScore = Math.min(100, score + bonus);

  // Label selon le score
  let scoreLabel, scoreColor;
  if (finalScore >= 90) { scoreLabel = "Excellent";  scoreColor = "#16a34a"; }
  else if (finalScore >= 80) { scoreLabel = "Très bon";   scoreColor = "#15803d"; }
  else if (finalScore >= 70) { scoreLabel = "Bon";         scoreColor = "#d97706"; }
  else if (finalScore >= 55) { scoreLabel = "Correct";     scoreColor = "#b45309"; }
  else                       { scoreLabel = "Moyen";       scoreColor = "#dc2626"; }

  return {
    ...offer,
    score: finalScore,
    scoreLabel,
    scoreColor,
    scoreDetails: points,
    tags: generateTags(offer),
  };
}

/**
 * Score un tableau d'offres et les trie par score décroissant
 * @param {Array} offers
 * @param {object} userPrefs
 * @returns {Array}
 */
function scoreOffers(offers, userPrefs = {}) {
  return offers
    .map(o => scoreOffer(o, userPrefs))
    .sort((a, b) => b.score - a.score);
}

module.exports = { scoreOffer, scoreOffers };
