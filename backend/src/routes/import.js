const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const importService = require('../services/importService');

// CSV comes in as a raw request body (Content-Type: text/csv), not
// multipart/form-data — avoids pulling in multer for a single small file.
router.use(express.text({ type: '*/*', limit: '10mb' }));

const IMPORTERS = {
  invoices: importService.importInvoicesFromCSV,
  properties: importService.importPropertiesFromCSV,
  leases: importService.importLeasesFromCSV,
  tenants: importService.importTenantsFromCSV,
  transactions: importService.importTransactionsFromCSV,
};

async function postImport(req, res) {
  const { dry_run, batch_id, entity_type = 'invoices' } = req.query;
  const csvText = req.body;

  if (!csvText || typeof csvText !== 'string' || !csvText.trim()) {
    return res.status(400).json({ error: 'Request body must be CSV text' });
  }

  const importFn = IMPORTERS[entity_type];
  if (!importFn) {
    return res.status(400).json({ error: `Unsupported entity_type: ${entity_type}` });
  }

  try {
    const result = await importFn(pool, req.user.id, csvText, {
      dryRun: dry_run === 'true',
      batchId: batch_id,
    });
    res.json(result);
  } catch (error) {
    console.error(`Failed to import ${entity_type}:`, error);
    res.status(400).json({ error: error.message });
  }
}

router.post('/', postImport);

module.exports = router;
module.exports.postImport = postImport;
