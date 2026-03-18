const MOCK_OFFERS = [
  { id: "mock-001", bourse: "Trans.eu", from: "Paris (75)", fromCountry: "FR", to: "Lyon (69)", toCountry: "FR", distKm: 465, weightTons: 18, loadType: "Complet (FTL)", price: 920, currency: "EUR", pricePerKm: 1.98, loadDate: getFutureDate(4), company: "Transport Duval SA", scrapedAt: new Date().toISOString(), score: null },
  { id: "mock-002", bourse: "Trans.eu", from: "Lille (59)", fromCountry: "FR", to: "Bordeaux (33)", toCountry: "FR", distKm: 710, weightTons: 22, loadType: "Complet (FTL)", price: 1250, currency: "EUR", pricePerKm: 1.76, loadDate: getFutureDate(18), company: "Gironde Fret SARL", scrapedAt: new Date().toISOString(), score: null },
  { id: "mock-003", bourse: "B2PWEB", from: "Marseille (13)", fromCountry: "FR", to: "Toulouse (31)", toCountry: "FR", distKm: 404, weightTons: 8, loadType: "Partiel (LTL)", price: 410, currency: "EUR", pricePerKm: 1.01, loadDate: getFutureDate(6), company: "SudOuest Trans", scrapedAt: new Date().toISOString(), score: null },
  { id: "mock-004", bourse: "Trans.eu", from: "Strasbourg (67)", fromCountry: "FR", to: "Paris (75)", toCountry: "FR", distKm: 489, weightTons: 24, loadType: "Complet (FTL)", price: 1080, currency: "EUR", pricePerKm: 2.21, loadDate: getFutureDate(10), company: "Rhénanie Transport", scrapedAt: new Date().toISOString(), score: null },
  { id: "mock-005", bourse: "B2PWEB", from: "Nantes (44)", fromCountry: "FR", to: "Rennes (35)", toCountry: "FR", distKm: 112, weightTons: 5, loadType: "Partiel (LTL)", price: 180, currency: "EUR", pricePerKm: 1.61, loadDate: getFutureDate(2), company: "Ouest Logistique", scrapedAt: new Date().toISOString(), score: null },
  { id: "mock-006", bourse: "Trans.eu", from: "Lyon (69)", fromCountry: "FR", to: "Genève (CH)", toCountry: "CH", distKm: 151, weightTons: 19, loadType: "Complet (FTL)", price: 520, currency: "EUR", pricePerKm: 3.44, loadDate: getFutureDate(14), company: "AlpeFreight GmbH", scrapedAt: new Date().toISOString(), score: null },
  { id: "mock-007", bourse: "B2PWEB", from: "Paris (75)", fromCountry: "FR", to: "Bruxelles (BE)", toCountry: "BE", distKm: 315, weightTons: 20, loadType: "Complet (FTL)", price: 780, currency: "EUR", pricePerKm: 2.48, loadDate: getFutureDate(8), company: "BelgaTrans NV", scrapedAt: new Date().toISOString(), score: null },
  { id: "mock-008", bourse: "Trans.eu", from: "Toulouse (31)", fromCountry: "FR", to: "Madrid (ES)", toCountry: "ES", distKm: 1100, weightTons: 23, loadType: "Complet (FTL)", price: 2100, currency: "EUR", pricePerKm: 1.91, loadDate: getFutureDate(28), company: "IberiaCargo SL", scrapedAt: new Date().toISOString(), score: null },
];

function getFutureDate(hoursFromNow) {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();
}

async function getMockOffers(filters = {}) {
  await new Promise(r => setTimeout(r, 300 + Math.random() * 600));
  let offers = [...MOCK_OFFERS];
  if (filters.fromCountry) offers = offers.filter(o => o.fromCountry === filters.fromCountry.toUpperCase());
  if (filters.toCountry) offers = offers.filter(o => o.toCountry === filters.toCountry.toUpperCase());
  if (filters.minWeightTons) offers = offers.filter(o => o.weightTons >= filters.minWeightTons);
  return offers.map(o => {
    const v = 1 + (Math.random() - 0.5) * 0.06;
    const p = Math.round(o.price * v);
    return { ...o, price: p, pricePerKm: o.distKm ? Math.round(p / o.distKm * 100) / 100 : null, scrapedAt: new Date().toISOString(), id: o.id + "_" + Date.now() };
  });
}

module.exports = { getMockOffers };
