const { toCsv, parseCsv } = require('../src/utils/csv');

describe('toCsv', () => {
  test('returns empty string for no rows', () => {
    expect(toCsv([])).toBe('');
  });

  test('writes a header row from the first object\'s keys, then one row per object', () => {
    const csv = toCsv([{ id: '1', amount: '10' }, { id: '2', amount: '20' }]);
    expect(csv).toBe('id,amount\n1,10\n2,20');
  });

  test('quotes a field containing a comma', () => {
    const csv = toCsv([{ id: '1', note: 'a,b' }]);
    expect(csv).toBe('id,note\n1,"a,b"');
  });

  test('quotes a field containing a double quote, doubling the inner quote', () => {
    const csv = toCsv([{ id: '1', note: 'say "hi"' }]);
    expect(csv).toBe('id,note\n1,"say ""hi"""');
  });

  test('renders null/undefined values as empty cells', () => {
    const csv = toCsv([{ id: '1', note: null, other: undefined }]);
    expect(csv).toBe('id,note,other\n1,,');
  });
});

describe('parseCsv', () => {
  test('parses header and rows into an array of objects', () => {
    const rows = parseCsv('id,amount\n1,10\n2,20');
    expect(rows).toEqual([
      { id: '1', amount: '10' },
      { id: '2', amount: '20' },
    ]);
  });

  test('handles a quoted field containing a comma', () => {
    const rows = parseCsv('id,note\n1,"a,b"');
    expect(rows).toEqual([{ id: '1', note: 'a,b' }]);
  });

  test('handles a quoted field with an escaped double quote', () => {
    const rows = parseCsv('id,note\n1,"say ""hi"""');
    expect(rows).toEqual([{ id: '1', note: 'say "hi"' }]);
  });

  test('ignores trailing blank lines', () => {
    const rows = parseCsv('id,amount\n1,10\n\n');
    expect(rows).toEqual([{ id: '1', amount: '10' }]);
  });

  test('returns an empty array for header-only input', () => {
    expect(parseCsv('id,amount\n')).toEqual([]);
  });
});
