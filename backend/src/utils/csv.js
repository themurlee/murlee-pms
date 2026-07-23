function escapeField(value) {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(rows) {
  if (rows.length === 0) return '';
  const columns = Object.keys(rows[0]);
  const lines = [columns.join(',')];
  for (const row of rows) {
    lines.push(columns.map((col) => escapeField(row[col])).join(','));
  }
  return lines.join('\n');
}

// Parses one CSV line into an array of fields, honoring RFC4180-style quoting
// (quoted fields may contain commas/newlines; "" inside a quoted field is a
// literal quote). Returns the parsed fields plus the index just past the line.
function parseLine(text, start) {
  const fields = [];
  let field = '';
  let i = start;
  let inQuotes = false;

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += char;
        i += 1;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
    } else if (char === ',') {
      fields.push(field);
      field = '';
      i += 1;
    } else if (char === '\n') {
      i += 1;
      break;
    } else if (char === '\r') {
      i += 1;
    } else {
      field += char;
      i += 1;
    }
  }
  fields.push(field);
  return { fields, next: i };
}

function parseCsv(text) {
  const lines = [];
  let pos = 0;
  while (pos < text.length) {
    const { fields, next } = parseLine(text, pos);
    lines.push(fields);
    pos = next;
  }

  if (lines.length === 0) return [];
  const [header, ...dataLines] = lines;
  return dataLines
    .filter((fields) => !(fields.length === 1 && fields[0] === ''))
    .map((fields) => Object.fromEntries(header.map((col, idx) => [col, fields[idx] ?? ''])));
}

module.exports = { toCsv, parseCsv };
