jest.mock('../src/config/db', () => ({}));
jest.mock('../src/services/importService', () => ({
  importInvoicesFromCSV: jest.fn(),
  importPropertiesFromCSV: jest.fn(),
  importLeasesFromCSV: jest.fn(),
  importTenantsFromCSV: jest.fn(),
  importTransactionsFromCSV: jest.fn(),
}));

const { postImport } = require('../src/routes/import');
const pool = require('../src/config/db');
const importService = require('../src/services/importService');

function makeRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

describe('POST /api/import', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects an empty body', async () => {
    const req = { query: {}, body: '', user: { id: 'owner-1' } };
    const res = makeRes();
    await postImport(req, res);
    expect(res.statusCode).toBe(400);
    expect(importService.importInvoicesFromCSV).not.toHaveBeenCalled();
  });

  test('defaults entity_type to invoices when not provided', async () => {
    importService.importInvoicesFromCSV.mockResolvedValue({});
    const req = { query: {}, body: 'external_id,lease_id,amount_due,due_date\next-1,lease-1,1400,2026-08-01', user: { id: 'owner-1' } };
    const res = makeRes();
    await postImport(req, res);
    expect(importService.importInvoicesFromCSV).toHaveBeenCalledWith(pool, 'owner-1', req.body, { dryRun: false, batchId: undefined });
  });

  test('passes the CSV body, owner id, dry_run, and batch_id through to the service', async () => {
    const result = { batch_id: 'b1', row_count: 1, success_count: 1, error_count: 0, dry_run: true, errors: [] };
    importService.importInvoicesFromCSV.mockResolvedValue(result);

    const req = {
      query: { dry_run: 'true', batch_id: 'b1' },
      body: 'external_id,lease_id,amount_due,due_date\next-1,lease-1,1400,2026-08-01',
      user: { id: 'owner-1' },
    };
    const res = makeRes();
    await postImport(req, res);

    expect(importService.importInvoicesFromCSV).toHaveBeenCalledWith(pool, 'owner-1', req.body, {
      dryRun: true, batchId: 'b1',
    });
    expect(res.body).toEqual(result);
  });

  test('defaults dry_run to false when not provided', async () => {
    importService.importInvoicesFromCSV.mockResolvedValue({});
    const req = { query: {}, body: 'external_id,lease_id,amount_due,due_date\next-1,lease-1,1400,2026-08-01', user: { id: 'owner-1' } };
    const res = makeRes();
    await postImport(req, res);
    expect(importService.importInvoicesFromCSV.mock.calls[0][3].dryRun).toBe(false);
  });

  test('returns 400 with the error message when the service throws', async () => {
    importService.importInvoicesFromCSV.mockRejectedValue(new Error('bad csv'));
    const req = { query: {}, body: 'x', user: { id: 'owner-1' } };
    const res = makeRes();
    await postImport(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'bad csv' });
  });

  test.each([
    ['properties', 'importPropertiesFromCSV'],
    ['leases', 'importLeasesFromCSV'],
    ['tenants', 'importTenantsFromCSV'],
    ['transactions', 'importTransactionsFromCSV'],
  ])('dispatches entity_type=%s to %s', async (entityType, fnName) => {
    importService[fnName].mockResolvedValue({ entity_type: entityType });
    const req = { query: { entity_type: entityType }, body: 'external_id,x\next-1,y', user: { id: 'owner-1' } };
    const res = makeRes();
    await postImport(req, res);

    expect(importService[fnName]).toHaveBeenCalledWith(pool, 'owner-1', req.body, { dryRun: false, batchId: undefined });
    expect(res.body).toEqual({ entity_type: entityType });
  });

  test('rejects an unsupported entity_type', async () => {
    const req = { query: { entity_type: 'unicorns' }, body: 'x', user: { id: 'owner-1' } };
    const res = makeRes();
    await postImport(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Unsupported entity_type: unicorns' });
    expect(importService.importInvoicesFromCSV).not.toHaveBeenCalled();
  });
});
