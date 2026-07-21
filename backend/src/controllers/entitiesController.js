const entitiesService = require('../services/entitiesService');

let mockEntities = [
  { id: 'E-1', name: 'Jayam Realty LLC', entity_type: 'LLC', ein: '88-1234567', property_count: 2 },
];

async function getEntities(req, res) {
  if (!process.env.DATABASE_URL) {
    return res.json(mockEntities);
  }
  try {
    res.json(await entitiesService.listEntities(req.user.id));
  } catch (error) {
    console.error('Failed to list entities:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function createEntity(req, res) {
  const { name, entity_type, ein } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  if (!process.env.DATABASE_URL) {
    const entity = { id: `E-${Date.now()}`, name, entity_type: entity_type || 'LLC', ein: ein || '', property_count: 0 };
    mockEntities.push(entity);
    return res.status(201).json(entity);
  }
  try {
    const id = await entitiesService.createEntity(req.user.id, { name, entity_type, ein });
    res.status(201).json({ id });
  } catch (error) {
    console.error('Failed to create entity:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function updateEntity(req, res) {
  const { id } = req.params;
  const { name, entity_type, ein } = req.body;

  if (!process.env.DATABASE_URL) {
    mockEntities = mockEntities.map((e) => (e.id === id ? { ...e, name, entity_type, ein } : e));
    return res.json({ message: 'Mock entity updated' });
  }
  try {
    const updated = await entitiesService.updateEntity(req.user.id, id, { name, entity_type, ein });
    if (!updated) return res.status(404).json({ error: 'Entity not found' });
    res.json({ message: 'Entity updated successfully' });
  } catch (error) {
    console.error('Failed to update entity:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function deleteEntity(req, res) {
  const { id } = req.params;

  if (!process.env.DATABASE_URL) {
    mockEntities = mockEntities.filter((e) => e.id !== id);
    return res.json({ message: 'Mock entity deleted' });
  }
  try {
    const deleted = await entitiesService.deleteEntity(req.user.id, id);
    if (!deleted) return res.status(404).json({ error: 'Entity not found' });
    res.json({ message: 'Entity deleted successfully' });
  } catch (error) {
    console.error('Failed to delete entity:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

module.exports = { getEntities, createEntity, updateEntity, deleteEntity };
