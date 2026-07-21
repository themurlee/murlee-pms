const billingService = require('../src/services/billingService');

// Minimal fake pool: pattern-matches on SQL text, returns canned rows, and
// records UPDATEs so we can assert late-fee application without a live DB.
function makeFakePool({ leases = [], lateInvoices = [], reminderInvoices = [] }) {
  const updates = [];
  return {
    updates,
    query: async (text, params) => {
      if (/FROM leases WHERE status = 'active' AND due_day/.test(text)) {
        return { rows: leases.filter((l) => l.due_day === params[0]) };
      }
      if (/INSERT INTO invoices/.test(text)) {
        return { rows: [{ id: `inv-${params[0]}` }] }; // always "created" in this fake
      }
      if (/UPDATE invoices SET late_fee/.test(text)) {
        updates.push({ lateFee: params[0], id: params[1] });
        return { rows: [] };
      }
      if (/status IN \('unpaid', 'overdue'\)/.test(text)) {
        return { rows: lateInvoices };
      }
      if (/i\.status = 'unpaid' AND i\.due_date =/.test(text)) {
        return { rows: reminderInvoices };
      }
      return { rows: [] };
    },
  };
}

const SETTINGS = { late_fee_amount: 50, late_fee_grace_days: 5, reminder_days_before: 3 };

describe('billingService', () => {
  test('generateInvoicesForDate creates one invoice per active lease whose due_day matches', async () => {
    const date = new Date(Date.UTC(2026, 6, 21)); // day 21
    const pool = makeFakePool({
      leases: [
        { id: 'L1', rent_amount: 1400, due_day: 21 },
        { id: 'L2', rent_amount: 1350, due_day: 21 },
        { id: 'L3', rent_amount: 900, due_day: 5 }, // different day, excluded by the query
      ],
    });
    const created = await billingService.generateInvoicesForDate(pool, date);
    expect(created).toBe(2);
  });

  test('assessLateFees applies the configured fee and sends a notice per overdue invoice', async () => {
    const date = new Date(Date.UTC(2026, 6, 21));
    const pool = makeFakePool({
      lateInvoices: [
        { id: 'inv-1', amount_due: 1400, due_date: '2026-07-01', tenant_id: 't1', tenant_name: 'Jane', tenant_email: 'jane@example.com', owner_id: 'o1' },
      ],
    });
    const applied = await billingService.assessLateFees(pool, date, SETTINGS);
    expect(applied).toBe(1);
    expect(pool.updates).toEqual([{ lateFee: 50, id: 'inv-1' }]);
  });

  test('sendReminders counts one reminder per matching unpaid invoice', async () => {
    const date = new Date(Date.UTC(2026, 6, 21));
    const pool = makeFakePool({
      reminderInvoices: [
        { id: 'inv-2', amount_due: 1350, due_date: '2026-07-24', tenant_id: 't2', tenant_name: 'John', tenant_email: 'john@example.com', owner_id: 'o1' },
      ],
    });
    const sent = await billingService.sendReminders(pool, date, SETTINGS);
    expect(sent).toBe(1);
  });
});
