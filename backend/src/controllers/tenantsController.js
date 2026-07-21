const pool = require('../config/db');
const tenantsService = require('../services/tenantsService');

let mockTenants = [
  {
    id: '1', name: 'Jane Doe', email: 'jane@example.com', phone: '555-0199',
    lease_id: 'L-1', unit_id: 'U-1', property_id: '1',
    unit: 'Oakridge #101', rent: 1400, due_day: 1, start_date: '2026-01-01', end_date: '2026-12-31',
    delinquency_notes: 'Will pay $1000 on 10/11 and $966.75 on 10/25',
    eviction_notes: 'Subject to approval, eviction warning issued.',
    housing_authority: 'Fulton County HA',
    payment_plan: '$1000 - 10/11, $966.75 - 10/25',
    documents: ['Lease_Agreement_Jane_Doe.pdf', 'Guarantor_Agreement.pdf'],
  },
  {
    id: '2', name: 'John Smith', email: 'john@example.com', phone: '555-0144',
    lease_id: 'L-2', unit_id: 'U-3', property_id: '2',
    unit: 'Pacific #4', rent: 1350, due_day: 1, start_date: '2025-02-15', end_date: '2027-02-14',
    delinquency_notes: '', eviction_notes: '', housing_authority: 'None', payment_plan: 'None',
    documents: ['Lease_Agreement_John_Smith.pdf'],
  },
];

async function getTenants(req, res) {
  if (!process.env.DATABASE_URL) {
    return res.json(mockTenants);
  }
  try {
    res.json(await tenantsService.listTenants(pool));
  } catch (error) {
    console.error('Failed to list tenants:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function createTenant(req, res) {
  const { name, email, unit_id, rent, start_date, end_date } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: 'name and email are required' });
  }
  if (!process.env.DATABASE_URL) {
    const newTenant = {
      id: String(Date.now()), name, email, phone: req.body.phone || '',
      lease_id: `L-${Date.now()}`, unit_id: unit_id || null, property_id: null,
      unit: req.body.unit || '', rent: rent || 0, due_day: req.body.due_day || 1,
      start_date: start_date || '', end_date: end_date || '',
      delinquency_notes: req.body.delinquency_notes || '', eviction_notes: req.body.eviction_notes || '',
      housing_authority: req.body.housing_authority || 'None', payment_plan: req.body.payment_plan || 'None',
      documents: req.body.documents || [],
    };
    mockTenants.push(newTenant);
    return res.status(201).json(newTenant);
  }

  if (!unit_id || !rent || !start_date || !end_date) {
    return res.status(400).json({ error: 'unit_id, rent, start_date, and end_date are required' });
  }

  try {
    const id = await tenantsService.createTenant(pool, req.body);
    res.status(201).json({ id });
  } catch (error) {
    console.error('Failed to create tenant:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function updateTenant(req, res) {
  const { id } = req.params;

  if (!process.env.DATABASE_URL) {
    mockTenants = mockTenants.map(t => (t.id === id ? { ...t, ...req.body } : t));
    return res.json({ message: 'Mock tenant updated' });
  }

  try {
    const updated = await tenantsService.updateTenant(pool, id, req.body);
    if (!updated) return res.status(404).json({ error: 'Tenant not found' });
    res.json({ message: 'Tenant updated successfully' });
  } catch (error) {
    console.error('Failed to update tenant:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function deleteTenant(req, res) {
  const { id } = req.params;

  if (!process.env.DATABASE_URL) {
    mockTenants = mockTenants.filter(t => t.id !== id);
    return res.json({ message: 'Mock tenant deleted' });
  }

  try {
    const result = await tenantsService.deleteTenant(pool, id);
    if (!result.ok) {
      if (result.error) return res.status(409).json({ error: result.error });
      return res.status(404).json({ error: 'Tenant not found' });
    }
    res.json({ message: 'Tenant deleted successfully' });
  } catch (error) {
    console.error('Failed to delete tenant:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

module.exports = { getTenants, createTenant, updateTenant, deleteTenant };
