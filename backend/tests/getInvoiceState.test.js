const getInvoiceState = (invoice) => {
  const isPaid = invoice.status === 'paid';
  const isOverdue = !isPaid && new Date() > new Date(invoice.due_date);
  
  return {
    ...invoice,
    status: isOverdue ? 'overdue' : invoice.status,
    actions: {
      can_mark_as_paid: !isPaid,
      can_edit: !isPaid,
      can_delete: !isPaid
    },
    view_modes: ['payment_timeline', 'invoice_breakdown']
  };
};

describe('getInvoiceState Unit Tests', () => {
  beforeEach(() => {
    // Lock test context timestamp to 2026-07-17T12:00:00Z
    jest.useFakeTimers().setSystemTime(new Date('2026-07-17T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('Case 1: Current unpaid invoice remains unpaid and actions allowed', () => {
    const invoice = {
      status: 'unpaid',
      due_date: '2026-07-20',
      amount_due: 2500.00
    };
    
    const state = getInvoiceState(invoice);
    
    expect(state.status).toBe('unpaid');
    expect(state.actions).toEqual({
      can_mark_as_paid: true,
      can_edit: true,
      can_delete: true
    });
  });

  test('Case 2: Overdue unpaid invoice transitions to overdue status and actions allowed', () => {
    const invoice = {
      status: 'unpaid',
      due_date: '2026-07-10',
      amount_due: 2500.00
    };
    
    const state = getInvoiceState(invoice);
    
    expect(state.status).toBe('overdue');
    expect(state.actions).toEqual({
      can_mark_as_paid: true,
      can_edit: true,
      can_delete: true
    });
  });

  test('Case 3: Already paid invoice remains paid and actions locked', () => {
    const invoice = {
      status: 'paid',
      due_date: '2026-07-10',
      amount_due: 2500.00
    };
    
    const state = getInvoiceState(invoice);
    
    expect(state.status).toBe('paid');
    expect(state.actions).toEqual({
      can_mark_as_paid: false,
      can_edit: false,
      can_delete: false
    });
  });
});
module.exports = getInvoiceState;
