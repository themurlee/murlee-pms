jest.mock('../src/config/db', () => ({ marker: 'the-shared-pool' }));
jest.mock('../src/services/invoiceService', () => ({ updateInvoiceStatus: jest.fn() }));

const { handleTransferWebhook } = require('../src/routes/webhooks');
const pool = require('../src/config/db');
const invoiceService = require('../src/services/invoiceService');

describe('handleTransferWebhook', () => {
  beforeEach(() => jest.clearAllMocks());

  test('calls updateInvoiceStatus with (pool, transferId, newStatus, context) — the real 4-arg signature', async () => {
    await handleTransferWebhook({
      transfer_id: 'tx_123',
      event_type: 'TRANSFER_STATUS_UPDATE',
      status: 'posted',
    });

    expect(invoiceService.updateInvoiceStatus).toHaveBeenCalledWith(
      pool,
      'tx_123',
      'paid',
      { reason: 'webhook:transfer_posted' }
    );
  });

  test.each([
    ['posted', 'paid'],
    ['failed', 'overdue'],
    ['pending', 'processing'],
  ])('maps Plaid transfer status %s to invoice status %s', async (plaidStatus, invoiceStatus) => {
    await handleTransferWebhook({
      transfer_id: 'tx_456',
      event_type: 'TRANSFER_STATUS_UPDATE',
      status: plaidStatus,
    });

    expect(invoiceService.updateInvoiceStatus).toHaveBeenCalledWith(
      pool, 'tx_456', invoiceStatus, { reason: `webhook:transfer_${plaidStatus}` }
    );
  });

  test('does nothing for a non-TRANSFER_STATUS_UPDATE event', async () => {
    await handleTransferWebhook({ transfer_id: 'tx_789', event_type: 'TRANSFER_CREATED', status: 'pending' });
    expect(invoiceService.updateInvoiceStatus).not.toHaveBeenCalled();
  });

  test('does nothing for an unrecognized transfer status', async () => {
    await handleTransferWebhook({ transfer_id: 'tx_999', event_type: 'TRANSFER_STATUS_UPDATE', status: 'canceled' });
    expect(invoiceService.updateInvoiceStatus).not.toHaveBeenCalled();
  });
});
