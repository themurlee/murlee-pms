const express = require('express');
const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());

const webhookRoutes = require('./routes/webhooks');
const invoiceRoutes = require('./routes/invoices');

app.use('/api/webhooks', webhookRoutes);
app.use('/api/invoices', invoiceRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', database: process.env.DATABASE_URL ? 'postgres' : 'mocked' });
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
