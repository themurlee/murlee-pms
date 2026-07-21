const { looksLikeMaintenanceRequest } = require('../src/services/maintenanceService');

describe('looksLikeMaintenanceRequest', () => {
  test('matches a maintenance keyword in the subject', () => {
    expect(looksLikeMaintenanceRequest('Leak in bathroom', 'Can you send someone?')).toBe(true);
  });

  test('matches a maintenance keyword in the body', () => {
    expect(looksLikeMaintenanceRequest('Quick question', 'The AC unit is broken and blowing warm air.')).toBe(true);
  });

  test('is case-insensitive', () => {
    expect(looksLikeMaintenanceRequest('URGENT REPAIR NEEDED', '')).toBe(true);
  });

  test('returns false for a non-maintenance message', () => {
    expect(looksLikeMaintenanceRequest('Lease renewal', 'Just checking on the renewal timeline.')).toBe(false);
  });

  test('handles missing subject/body gracefully', () => {
    expect(looksLikeMaintenanceRequest(undefined, undefined)).toBe(false);
  });
});
