const unitsService = require('../services/unitsService');

const mockUnits = [
  { id: 'U-1', unit_number: '101', beds: 2, baths: 1, sq_ft: 850, market_rent: 1400, property_id: '1', property_name: 'Oakridge Manor', tenant_id: '1', tenant_name: 'Jane Doe', tenant_email: 'jane@example.com', rent: 1400, lease_start: '2026-01-01', lease_end: '2026-12-31', balance_due: 1400 },
  { id: 'U-2', unit_number: '102', beds: 2, baths: 1, sq_ft: 900, market_rent: 1500, property_id: '1', property_name: 'Oakridge Manor', tenant_id: '3', tenant_name: 'Alice Cooper', tenant_email: 'alice@example.com', rent: 1500, lease_start: '2026-03-01', lease_end: '2027-02-28', balance_due: 0 },
  { id: 'U-3', unit_number: '4', beds: 1, baths: 1, sq_ft: 620, market_rent: 1350, property_id: '2', property_name: 'Pacific Breeze', tenant_id: '2', tenant_name: 'John Smith', tenant_email: 'john@example.com', rent: 1350, lease_start: '2025-02-15', lease_end: '2027-02-14', balance_due: 1400 },
  { id: 'U-4', unit_number: '12', beds: 2, baths: 2, sq_ft: 1050, market_rent: 1600, property_id: '2', property_name: 'Pacific Breeze', tenant_id: null, tenant_name: null, tenant_email: null, rent: null, lease_start: null, lease_end: null, balance_due: null },
];

async function getUnits(req, res) {
  if (!process.env.DATABASE_URL) {
    return res.json(mockUnits);
  }
  try {
    res.json(await unitsService.listUnits(req.user.id));
  } catch (error) {
    console.error('Failed to list units:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

module.exports = { getUnits };
