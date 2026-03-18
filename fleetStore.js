/**
 * FreightBot Pro — Store de la flotte
 * Stocke les véhicules par userId en mémoire
 * (remplacer par PostgreSQL en production)
 */

const fleets = new Map(); // userId → [vehicles]

/**
 * Structure d'un véhicule :
 * {
 *   id: "VH-001",
 *   immat: "AB-123-CD",
 *   type: "Semi-remorque 90m³",
 *   weightCapacity: 24,        // tonnes
 *   driver: "M. Dupont",
 *   status: "Disponible" | "En mission",
 *   // Position actuelle
 *   currentCity: "Paris",
 *   lat: 48.8566,
 *   lon: 2.3522,
 *   availableAt: "2024-06-10T14:00:00Z",
 *   // Base du transporteur
 *   baseCity: "Paris",
 *   baseLat: 48.8566,
 *   baseLon: 2.3522,
 * }
 */

function getFleet(userId) {
  return fleets.get(userId) || [];
}

function saveVehicle(userId, vehicle) {
  const fleet = getFleet(userId);
  const idx = fleet.findIndex(v => v.id === vehicle.id);
  if (idx >= 0) fleet[idx] = vehicle;
  else fleet.push(vehicle);
  fleets.set(userId, fleet);
  return vehicle;
}

function deleteVehicle(userId, vehicleId) {
  const fleet = getFleet(userId).filter(v => v.id !== vehicleId);
  fleets.set(userId, fleet);
}

function updateVehiclePosition(userId, vehicleId, lat, lon, city) {
  const fleet = getFleet(userId);
  const v = fleet.find(v => v.id === vehicleId);
  if (v) { v.lat = lat; v.lon = lon; v.currentCity = city; }
  fleets.set(userId, fleet);
}

module.exports = { getFleet, saveVehicle, deleteVehicle, updateVehiclePosition };
