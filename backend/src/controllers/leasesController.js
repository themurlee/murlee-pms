const leasesService = require('../services/leasesService');

const mockLeases = [
  { id: 'L-101', tenant_name: 'Jane Doe', unit_number: '101', rent_amount: 1400, due_day: 1, start_date: '2026-01-01', end_date: '2026-12-31', status: 'active' },
  { id: 'L-102', tenant_name: 'John Smith', unit_number: '4', rent_amount: 1350, due_day: 1, start_date: '2026-01-01', end_date: '2026-12-31', status: 'active' },
];

async function getLeases(req, res) {
  if (!process.env.DATABASE_URL) {
    return res.json(mockLeases);
  }
  try {
    res.json(await leasesService.listLeases());
  } catch (error) {
    console.error('Failed to list leases:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function createLease(req, res) {
  const { unit_id, tenant_id, rent_amount, due_day, start_date, end_date } = req.body;
  if (!unit_id || !tenant_id || !rent_amount || !start_date || !end_date) {
    return res.status(400).json({ error: 'unit_id, tenant_id, rent_amount, start_date, end_date are required' });
  }

  if (!process.env.DATABASE_URL) {
    return res.status(201).json({ id: `L-${Date.now()}` });
  }

  try {
    const id = await leasesService.createLease({ unit_id, tenant_id, rent_amount, due_day, start_date, end_date });
    res.status(201).json({ id });
  } catch (error) {
    console.error('Failed to create lease:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

module.exports = { getLeases, createLease };
