// Minimal RFC-4180-ish CSV parser — handles quoted fields with commas,
// embedded quotes ("") and newlines. Returns rows of string cells.
export function parseCSV(text: string): string[][] {
  text = text.replace(/^﻿/, '') // strip BOM
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') { row.push(field); field = '' }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
      else if (c === '\r') { /* ignore */ }
      else field += c
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows.filter(r => r.some(cell => cell.trim() !== ''))
}

// Parse with the first row as headers → array of objects.
export function parseCSVObjects(text: string): Record<string, string>[] {
  const rows = parseCSV(text)
  if (!rows.length) return []
  const headers = rows[0].map(h => h.trim())
  return rows.slice(1).map(r => {
    const o: Record<string, string> = {}
    headers.forEach((h, i) => { o[h] = (r[i] ?? '').trim() })
    return o
  })
}
