const propertiesService = require('../services/propertiesService');
const { invalidateDashboardCache } = require('../lib/cache');

const asAddressString = (a) => (typeof a === 'object' && a !== null
  ? [a.street, a.city, a.state, a.zip].filter(Boolean).join(', ') : a || '');

let mockProperties = [
  { id: '1', name: 'Oakridge Manor', units: 2, income: 2900, address: '128 Oakridge Dr, Atlanta, GA 30301', address_parts: { street: '128 Oakridge Dr', city: 'Atlanta', state: 'GA', zip: '30301' }, property_type: 'Multi-Family', entity_id: 'E-1', entity_name: 'Jayam Realty LLC' },
  { id: '2', name: 'Pacific Breeze', units: 1, income: 1350, address: '445 Coastline Hwy, San Diego, CA 92101', address_parts: { street: '445 Coastline Hwy', city: 'San Diego', state: 'CA', zip: '92101' }, property_type: 'Single-Family', entity_id: 'E-1', entity_name: 'Jayam Realty LLC' },
];

async function getProperties(req, res) {
  if (!process.env.DATABASE_URL) {
    return res.json(mockProperties);
  }
  try {
    const properties = await propertiesService.listProperties(req.user.id);
    res.json(properties);
  } catch (error) {
    console.error('Failed to list properties:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function createProperty(req, res) {
  const { name, address, property_type, entity_id, units, unit_list, income } = req.body;
  if (!name || !address) {
    return res.status(400).json({ error: 'name and address are required' });
  }

  if (!process.env.DATABASE_URL) {
    const unitCount = Array.isArray(unit_list) && unit_list.length ? unit_list.length : (units || 1);
    const rentRoll = Array.isArray(unit_list) && unit_list.length
      ? unit_list.reduce((s, u) => s + (Number(u.market_rent) || 0), 0) : (income || 0);
    const newProperty = {
      id: String(Date.now()), name, address: asAddressString(address), address_parts: typeof address === 'object' ? address : { street: address },
      property_type: property_type || 'Single-Family', entity_id: entity_id || null, entity_name: null,
      units: unitCount, income: rentRoll,
    };
    mockProperties.push(newProperty);
    return res.status(201).json(newProperty);
  }

  try {
    const id = await propertiesService.createProperty(req.user.id, { name, address, property_type, entity_id, units, unit_list, income });
    invalidateDashboardCache();
    res.status(201).json({ id });
  } catch (error) {
    console.error('Failed to create property:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function updateProperty(req, res) {
  const { id } = req.params;
  const { name, address, property_type, entity_id, income } = req.body;

  if (!process.env.DATABASE_URL) {
    mockProperties = mockProperties.map(p => (p.id === id
      ? { ...p, name, address: asAddressString(address), address_parts: typeof address === 'object' ? address : p.address_parts, property_type: property_type || p.property_type, entity_id: entity_id ?? p.entity_id, income }
      : p));
    return res.json({ message: 'Mock property updated' });
  }

  try {
    const updated = await propertiesService.updateProperty(req.user.id, id, { name, address, property_type, entity_id, income });
    if (!updated) return res.status(404).json({ error: 'Property not found' });
    invalidateDashboardCache();
    res.json({ message: 'Property updated successfully' });
  } catch (error) {
    console.error('Failed to update property:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function deleteProperty(req, res) {
  const { id } = req.params;

  if (!process.env.DATABASE_URL) {
    mockProperties = mockProperties.filter(p => p.id !== id);
    return res.json({ message: 'Mock property deleted' });
  }

  try {
    const deleted = await propertiesService.deleteProperty(req.user.id, id);
    if (!deleted) return res.status(404).json({ error: 'Property not found' });
    invalidateDashboardCache();
    res.json({ message: 'Property deleted successfully' });
  } catch (error) {
    console.error('Failed to delete property:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

module.exports = { getProperties, createProperty, updateProperty, deleteProperty };
