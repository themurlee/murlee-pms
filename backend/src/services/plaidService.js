const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');

let plaidClient;
const hasPlaidKeys = process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET;

if (hasPlaidKeys && process.env.PLAID_CLIENT_ID !== 'mock_client_id') {
  plaidClient = new PlaidApi(new Configuration({
    basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
        'PLAID-SECRET': process.env.PLAID_SECRET,
      },
    },
  }));
}

/**
 * Creates link token in UPDATE mode to refresh expiring credentials
 * @param {string} accessToken 
 */
async function getUpdateLinkToken(accessToken) {
  if (!plaidClient) {
    console.warn('Plaid credentials missing. Returning mock link token.');
    return 'link-sandbox-mock-token-12345';
  }
  const response = await plaidClient.linkTokenCreate({
    user: { client_user_id: 'landlord_user_id' },
    client_name: 'Antigravity PMS',
    language: 'en',
    products: ['transactions'],
    country_codes: ['US'],
    access_token: accessToken
  });
  return response.data.link_token;
}

module.exports = {
  getUpdateLinkToken,
};
