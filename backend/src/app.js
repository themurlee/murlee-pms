const express = require('express');
const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());

const { requireAuth } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const webhookRoutes = require('./routes/webhooks');
const invoiceRoutes = require('./routes/invoices');
const propertiesRoutes = require('./routes/properties');
const tenantsRoutes = require('./routes/tenants');
const leasesRoutes = require('./routes/leases');
const unitsRoutes = require('./routes/units');
const maintenanceRoutes = require('./routes/maintenance');
const dashboardRoutes = require('./routes/dashboard');
const entitiesRoutes = require('./routes/entities');
const noticesRoutes = require('./routes/notices');
const threadsRoutes = require('./routes/threads');
const billingRoutes = require('./routes/billing');
const transactionsRoutes = require('./routes/transactions');

// Plaid webhooks are authenticated by Plaid signature, not JWT; auth's own
// /login route is the one endpoint that must be reachable pre-token.
app.use('/api/webhooks', webhookRoutes);
app.use('/api/auth', authRoutes);

app.use('/api/invoices', requireAuth, invoiceRoutes);
app.use('/api/properties', requireAuth, propertiesRoutes);
app.use('/api/tenants', requireAuth, tenantsRoutes);
app.use('/api/leases', requireAuth, leasesRoutes);
app.use('/api/units', requireAuth, unitsRoutes);
app.use('/api/maintenance', requireAuth, maintenanceRoutes);
app.use('/api/dashboard', requireAuth, dashboardRoutes);
app.use('/api/entities', requireAuth, entitiesRoutes);
app.use('/api/notices', requireAuth, noticesRoutes);
app.use('/api/threads', requireAuth, threadsRoutes);
app.use('/api/billing', requireAuth, billingRoutes);
app.use('/api/transactions', requireAuth, transactionsRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', database: process.env.DATABASE_URL ? 'postgres' : 'mocked' });
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
  // Billing automation only makes sense against a real DB.
  if (process.env.DATABASE_URL) {
    require('./lib/scheduler').startScheduler();
  }
});
