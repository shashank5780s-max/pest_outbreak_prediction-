/**
 * @deprecated Frontend CSV parsing is a temporary measure.
 * Prefer fetching processed data from backend API endpoints:
 *   - /district-data  → district pest summary (replaces CSV parsing in FieldMap, Analytics, Alerts)
 *   - /live-weather   → crop + pest prediction for a given location
 * TODO: Migrate FieldMap and Prediction pages to use these endpoints.
 */

export interface RawRow {
  [key: string]: string;
}


export async function fetchCSV(path: string): Promise<RawRow[]> {
  const res = await fetch(path);
  if (!res.ok) throw new Error('Failed to fetch CSV');
  const text = await res.text();
  return parseCSV(text);
}

export function parseCSV(csvText: string): RawRow[] {
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  const rows: RawRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length < headers.length) continue;
    const row: RawRow = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = parts[j] ? parts[j].trim() : '';
    }
    rows.push(row);
  }
  return rows;
}
