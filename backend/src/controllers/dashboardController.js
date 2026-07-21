const dashboardService = require('../services/dashboardService');
const cache = require('../lib/cache');

const MOCK_SUMMARY = {
  grossMonthlyIncome: 26600,
  totalUnits: 25,
  occupiedUnits: 20,
  overdueTotal: 1596,
  openMaintenanceCount: 2,
  rentCollectionRate: 0.94,
};

async function getSummary(req, res) {
  if (!process.env.DATABASE_URL) {
    return res.json(MOCK_SUMMARY);
  }

  const cached = cache.get(cache.DASHBOARD_CACHE_KEY);
  if (cached) {
    return res.json(cached);
  }

  try {
    const summary = await dashboardService.getSummary();
    cache.set(cache.DASHBOARD_CACHE_KEY, summary, 15_000);
    res.json(summary);
  } catch (error) {
    console.error('Failed to compute dashboard summary:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

module.exports = { getSummary };
