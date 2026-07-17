const SCHEDULE_E_CATEGORIES = {
  RENT: 'Rent Received',
  ADVERTISING: 'Advertising',
  AUTO_TRAVEL: 'Auto and Travel',
  CLEANING_MAINTENANCE: 'Cleaning and Maintenance',
  INSURANCE: 'Insurance',
  LEGAL_PROFESSIONAL: 'Legal and Other Professional Fees',
  MORTGAGE_INTEREST: 'Mortgage Interest Paid to Banks',
  REPAIRS: 'Repairs',
  SUPPLIES: 'Supplies',
  TAXES: 'Taxes',
  UTILITIES: 'Utilities',
  OTHER: 'Other Expenses'
};

/**
 * Maps transaction details from Plaid descriptors to IRS Schedule E classifications
 * @param {string} plaidTransactionName 
 * @param {string[]} plaidCategories 
 */
function autoCategorizeTransaction(plaidTransactionName, plaidCategories) {
  const text = plaidTransactionName.toLowerCase();
  const cats = plaidCategories.map(c => c.toLowerCase());

  if (text.includes('rent') || cats.includes('rent') || cats.includes('lease')) {
    return { category: SCHEDULE_E_CATEGORIES.RENT, flag: 'auto' };
  }
  if (text.includes('plumbing') || text.includes('hvac') || text.includes('repair') || cats.includes('maintenance')) {
    return { category: SCHEDULE_E_CATEGORIES.REPAIRS, flag: 'auto' };
  }
  if (text.includes('hardware') || text.includes('depot') || text.includes('lowe') || cats.includes('supplies')) {
    return { category: SCHEDULE_E_CATEGORIES.SUPPLIES, flag: 'auto' };
  }
  if (text.includes('electric') || text.includes('water') || text.includes('gas') || cats.includes('utilities')) {
    return { category: SCHEDULE_E_CATEGORIES.UTILITIES, flag: 'auto' };
  }
  if (text.includes('tax') || cats.includes('taxes')) {
    return { category: SCHEDULE_E_CATEGORIES.TAXES, flag: 'auto' };
  }
  
  return { category: SCHEDULE_E_CATEGORIES.OTHER, flag: 'manual_review_required' };
}

module.exports = {
  SCHEDULE_E_CATEGORIES,
  autoCategorizeTransaction,
};
