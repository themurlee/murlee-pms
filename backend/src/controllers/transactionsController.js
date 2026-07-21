const pool = require('../config/db');
const transactionsService = require('../services/transactionsService');

const mockTransactions = [
  { id: 'L-2', transaction_date: '2026-07-10', description: 'Monthly Rent - Jane Doe', amount: 1400,
    category: 'Rent Received', account_class: 'real_estate', source: 'manual', payment_method: 'check',
    property_id: null, entity_id: null, invoice_id: null, reviewed: true, memo: '' },
  { id: 'L-3', transaction_date: '2026-07-08', description: 'Home Depot supplies', amount: -85,
    category: 'Supplies', account_class: 'real_estate', source: 'manual', payment_method: '',
    property_id: null, entity_id: null, invoice_id: null, reviewed: false, memo: 'Review tax allocation' },
  { id: 'L-1', transaction_date: '2026-07-05', description: 'ONELIFE VICKERY SPORTS C', amount: -200,
    category: 'Health & Wellness', account_class: 'personal', source: 'manual', payment_method: '',
    property_id: null, entity_id: null, invoice_id: null, reviewed: false, memo: '' },
];

function parseFilters(q) {
  const f = {};
  if (q.account_class) f.account_class = q.account_class;
  if (q.property_id) f.property_id = q.property_id;
  if (q.entity_id) f.entity_id = q.entity_id;
  if (q.category) f.category = q.category;
  if (q.reviewed !== undefined) f.reviewed = q.reviewed === 'true';
  if (q.from) f.from = q.from;
  if (q.to) f.to = q.to;
  if (q.q) f.q = q.q;
  return f;
}

async function getTransactions(req, res) {
  const filters = parseFilters(req.query);
  if (!process.env.DATABASE_URL) {
    let rows = mockTransactions;
    if (filters.account_class) rows = rows.filter((r) => r.account_class === filters.account_class);
    return res.json(rows);
  }
  try {
    res.json(await transactionsService.listTransactions(pool, req.user.id, filters));
  } catch (error) {
    console.error('Failed to list transactions:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function createTransaction(req, res) {
  const { amount, transaction_date } = req.body;
  if (amount === undefined || !transaction_date) {
    return res.status(400).json({ error: 'amount and transaction_date are required' });
  }
  if (!process.env.DATABASE_URL) {
    const tx = { id: `L-${Date.now()}`, reviewed: false, memo: '', source: 'manual',
      account_class: 'real_estate', payment_method: '', property_id: null, entity_id: null,
      invoice_id: null, ...req.body };
    mockTransactions.unshift(tx);
    return res.status(201).json(tx);
  }
  try {
    const id = await transactionsService.createTransaction(pool, req.user.id, req.body);
    res.status(201).json({ id });
  } catch (error) {
    console.error('Failed to create transaction:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function updateTransaction(req, res) {
  const { id } = req.params;
  if (!process.env.DATABASE_URL) {
    return res.json({ message: 'Mock transaction updated' });
  }
  try {
    const ok = await transactionsService.updateTransaction(pool, req.user.id, id, req.body);
    if (!ok) return res.status(404).json({ error: 'Transaction not found' });
    res.json({ message: 'Transaction updated successfully' });
  } catch (error) {
    console.error('Failed to update transaction:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function deleteTransaction(req, res) {
  const { id } = req.params;
  if (!process.env.DATABASE_URL) {
    return res.json({ message: 'Mock transaction deleted' });
  }
  try {
    const ok = await transactionsService.deleteTransaction(pool, req.user.id, id);
    if (!ok) return res.status(404).json({ error: 'Transaction not found' });
    res.json({ message: 'Transaction deleted successfully' });
  } catch (error) {
    console.error('Failed to delete transaction:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

module.exports = { getTransactions, createTransaction, updateTransaction, deleteTransaction };
