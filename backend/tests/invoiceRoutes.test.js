const router = require('../src/routes/invoices');

describe('routes/invoices route ordering', () => {
  test('POST /batch/mark-paid is registered before POST /:id/mark-paid', () => {
    const postRoutes = router.stack
      .filter((layer) => layer.route && layer.route.methods.post)
      .map((layer) => layer.route.path);

    const batchIndex = postRoutes.indexOf('/batch/mark-paid');
    const singleIndex = postRoutes.indexOf('/:id/mark-paid');

    expect(batchIndex).toBeGreaterThan(-1);
    expect(singleIndex).toBeGreaterThan(-1);
    expect(batchIndex).toBeLessThan(singleIndex);
  });
});
