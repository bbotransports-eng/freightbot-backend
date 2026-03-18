/**
 * FreightBot Pro — Geocodeur
 * Convertit une ville/adresse en coordonnées GPS
 * Utilise l'API Nominatim (OpenStreetMap) — gratuite, sans clé
 */

const cache = new Map();

/**
 * Convertit une ville en coordonnées GPS
 * @param {string} city — ex: "Paris", "Lyon (69)", "Marseille"
 * @returns {Promise<{lat, lon} | null>}
 */
async function geocodeCity(city) {
  if (!city) return null;

  // Nettoyer le nom de ville (enlever le code dept entre parenthèses)
  const cleanCity = city.replace(/\s*\(\d+\)\s*/, "").trim();

  if (cache.has(cleanCity)) return cache.get(cleanCity);

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cleanCity + ", France")}&format=json&limit=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": "FreightBotPro/1.0 (transport management app)" }
    });

    if (!res.ok) return null;
    const data = await res.json();

    if (!data.length) return null;

    const coords = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    cache.set(cleanCity, coords);
    return coords;

  } catch (err) {
    return null;
  }
}

/**
 * Enrichit une liste d'offres avec les coordonnées GPS des villes
 */
async function enrichOffersWithCoords(offers) {
  return Promise.all(offers.map(async (offer) => {
    const [loading, unloading] = await Promise.all([
      geocodeCity(offer.from),
      geocodeCity(offer.to),
    ]);
    return {
      ...offer,
      loadingLat:   loading?.lat  || null,
      loadingLon:   loading?.lon  || null,
      unloadingLat: unloading?.lat || null,
      unloadingLon: unloading?.lon || null,
    };
  }));
}

module.exports = { geocodeCity, enrichOffersWithCoords };
