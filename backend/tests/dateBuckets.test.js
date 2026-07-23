const { bucketInvoicesByDueDate } = require('../src/utils/dateBuckets');

describe('bucketInvoicesByDueDate', () => {
  // Reference "now" fixed mid-July 2026, so June = previous month, July = current month.
  const referenceDate = new Date('2026-07-17T12:00:00Z');

  test('sorts invoices into current_month and previous_month by due_date', () => {
    const invoices = [
      { id: 'july-1', due_date: '2026-07-01' },
      { id: 'july-30', due_date: '2026-07-31' },
      { id: 'june-1', due_date: '2026-06-01' },
      { id: 'june-30', due_date: '2026-06-30' },
    ];

    const { current_month, previous_month } = bucketInvoicesByDueDate(invoices, referenceDate);

    expect(current_month.map((i) => i.id)).toEqual(['july-1', 'july-30']);
    expect(previous_month.map((i) => i.id)).toEqual(['june-1', 'june-30']);
  });

  test('excludes invoices outside both the current and previous month', () => {
    const invoices = [
      { id: 'may', due_date: '2026-05-15' },
      { id: 'august', due_date: '2026-08-15' },
    ];

    const { current_month, previous_month } = bucketInvoicesByDueDate(invoices, referenceDate);

    expect(current_month).toEqual([]);
    expect(previous_month).toEqual([]);
  });

  test('handles the January boundary (previous month rolls back a year)', () => {
    const jan = new Date('2027-01-10T00:00:00Z');
    const invoices = [
      { id: 'dec', due_date: '2026-12-15' },
      { id: 'jan', due_date: '2027-01-05' },
    ];

    const { current_month, previous_month } = bucketInvoicesByDueDate(invoices, jan);

    expect(current_month.map((i) => i.id)).toEqual(['jan']);
    expect(previous_month.map((i) => i.id)).toEqual(['dec']);
  });

  test('returns empty buckets for an empty input list', () => {
    expect(bucketInvoicesByDueDate([], referenceDate)).toEqual({ current_month: [], previous_month: [] });
  });
});
