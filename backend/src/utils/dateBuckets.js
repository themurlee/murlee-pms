/**
 * Splits invoice rows into current-month / previous-month buckets by due_date.
 * Uses UTC month boundaries so the split doesn't shift with the server's local
 * timezone. `referenceDate` is injectable for deterministic tests.
 */
function bucketInvoicesByDueDate(invoices, referenceDate = new Date()) {
  const startOfThisMonth = Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1);
  const startOfNextMonth = Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() + 1, 1);
  const startOfPrevMonth = Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() - 1, 1);

  const current_month = [];
  const previous_month = [];

  for (const invoice of invoices) {
    const dueDate = new Date(invoice.due_date).getTime();
    if (dueDate >= startOfThisMonth && dueDate < startOfNextMonth) {
      current_month.push(invoice);
    } else if (dueDate >= startOfPrevMonth && dueDate < startOfThisMonth) {
      previous_month.push(invoice);
    }
  }

  return { current_month, previous_month };
}

module.exports = { bucketInvoicesByDueDate };
