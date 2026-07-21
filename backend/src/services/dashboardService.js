const pool = require('../config/db');

const SUMMARY_QUERY = `
  SELECT
    (SELECT COALESCE(SUM(rent_amount), 0) FROM leases WHERE status = 'active') AS gross_monthly_income,
    (SELECT COUNT(*) FROM units) AS total_units,
    (SELECT COUNT(DISTINCT unit_id) FROM leases WHERE status = 'active') AS occupied_units,
    (SELECT COALESCE(SUM(amount_due + late_fee), 0) FROM invoices WHERE status IN ('unpaid', 'overdue')) AS overdue_total,
    (SELECT COUNT(*) FROM maintenance_tickets WHERE status != 'resolved') AS open_maintenance_count,
    (SELECT COUNT(*) FROM invoices WHERE status = 'paid' AND date_trunc('month', due_date) = date_trunc('month', CURRENT_DATE)) AS paid_this_month,
    (SELECT COUNT(*) FROM invoices WHERE date_trunc('month', due_date) = date_trunc('month', CURRENT_DATE)) AS invoiced_this_month
`;

async function getSummary() {
  const result = await pool.query(SUMMARY_QUERY);
  const row = result.rows[0];
  const invoicedThisMonth = parseInt(row.invoiced_this_month, 10) || 0;
  const paidThisMonth = parseInt(row.paid_this_month, 10) || 0;

  return {
    grossMonthlyIncome: parseFloat(row.gross_monthly_income),
    totalUnits: parseInt(row.total_units, 10),
    occupiedUnits: parseInt(row.occupied_units, 10),
    overdueTotal: parseFloat(row.overdue_total),
    openMaintenanceCount: parseInt(row.open_maintenance_count, 10),
    rentCollectionRate: invoicedThisMonth === 0 ? 1 : paidThisMonth / invoicedThisMonth,
  };
}

module.exports = { getSummary };
