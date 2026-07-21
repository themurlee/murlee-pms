const unitsService = require('../services/unitsService');

const mockUnits = [
  { id: 'U-1', unit_number: '101', beds: 2, baths: 1, sq_ft: 850, market_rent: 1400, property_id: '1', property_name: 'Oakridge Manor', tenant_id: '1', tenant_name: 'Jane Doe', tenant_email: 'jane@example.com' },
  { id: 'U-2', unit_number: '4', beds: 1, baths: 1, sq_ft: 620, market_rent: 1350, property_id: '2', property_name: 'Pacific Breeze', tenant_id: '2', tenant_name: 'John Smith', tenant_email: 'john@example.com' },
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
