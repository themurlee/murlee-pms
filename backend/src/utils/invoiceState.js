/**
 * Single source of truth for invoice status/action derivation. `invoices.status`
 * in the DB only ever holds paid|unpaid|processing — `overdue` and the
 * can_mark_as_paid/can_edit/can_delete flags are a read-time view layered on
 * top here, not stored.
 */
function getInvoiceState(invoice) {
  const isPaid = invoice.status === 'paid';
  const isSettling = invoice.status === 'processing'; // in-flight ACH transfer, not late
  const isOverdue = !isPaid && !isSettling && new Date() > new Date(invoice.due_date);

  return {
    ...invoice,
    status: isOverdue ? 'overdue' : invoice.status,
    actions: {
      can_mark_as_paid: !isPaid,
      can_edit: !isPaid,
      can_delete: !isPaid,
    },
    view_modes: ['payment_timeline', 'invoice_breakdown'],
  };
}

module.exports = { getInvoiceState };
