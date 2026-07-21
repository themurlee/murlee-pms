const tenantsService = require('../services/tenantsService');

// NOTE (known gap, thin-slice scope): unit/rent/delinquency/eviction/housing/payment-plan
// fields live on `leases`, which requires a real unit_id. The current Add/Edit Tenant
// form collects a free-text unit string, not a unit picker, so those fields are accepted
// here but not yet persisted relationally — only name/email/phone are real. Wiring a
// unit picker + lease upsert is the natural next pass.
let mockTenants = [
  {
    id: '1', name: 'Jane Doe', email: 'jane@example.com', phone: '555-0199', unit: 'Oakridge #101', rent: 1400,
    delinquency_notes: 'Will pay $1000 on 10/11 and $966.75 on 10/25',
    eviction_notes: 'Subject to approval, eviction warning issued.',
    housing_authority: 'Fulton County HA',
    payment_plan: '$1000 - 10/11, $966.75 - 10/25',
    documents: ['Lease_Agreement_Jane_Doe.pdf', 'Guarantor_Agreement.pdf'],
  },
  {
    id: '2', name: 'John Smith', email: 'john@example.com', phone: '555-0144', unit: 'Pacific #4', rent: 1350,
    delinquency_notes: '', eviction_notes: '', housing_authority: 'None', payment_plan: 'None',
    documents: ['Lease_Agreement_John_Smith.pdf'],
  },
];

async function getTenants(req, res) {
  if (!process.env.DATABASE_URL) {
    return res.json(mockTenants);
  }
  try {
    res.json(await tenantsService.listTenants());
  } catch (error) {
    console.error('Failed to list tenants:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function createTenant(req, res) {
  const { name, email, phone } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: 'name and email are required' });
  }

  if (!process.env.DATABASE_URL) {
    const newTenant = { id: String(Date.now()), name, email, phone: phone || '', unit: req.body.unit || '', rent: req.body.rent || 0, delinquency_notes: '', eviction_notes: '', housing_authority: 'None', payment_plan: 'None', documents: [] };
    mockTenants.push(newTenant);
    return res.status(201).json(newTenant);
  }

  try {
    const id = await tenantsService.createTenant({ name, email, phone });
    res.status(201).json({ id });
  } catch (error) {
    console.error('Failed to create tenant:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function updateTenant(req, res) {
  const { id } = req.params;
  const { name, email, phone } = req.body;

  if (!process.env.DATABASE_URL) {
    mockTenants = mockTenants.map(t => (t.id === id ? { ...t, ...req.body } : t));
    return res.json({ message: 'Mock tenant updated' });
  }

  try {
    const updated = await tenantsService.updateTenant(id, { name, email, phone });
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
    const deleted = await tenantsService.deleteTenant(id);
    if (!deleted) return res.status(404).json({ error: 'Tenant not found' });
    res.json({ message: 'Tenant deleted successfully' });
  } catch (error) {
    console.error('Failed to delete tenant:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

module.exports = { getTenants, createTenant, updateTenant, deleteTenant };
