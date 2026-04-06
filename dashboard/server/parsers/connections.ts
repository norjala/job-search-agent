import Papa from 'papaparse'
import { readFile } from 'fs/promises'

export interface Connection {
  firstName: string
  lastName: string
  url: string
  company: string
  position: string
}

export async function parseConnections(csvPath: string): Promise<Connection[]> {
  try {
    const content = await readFile(csvPath, 'utf-8')
    const result = Papa.parse(content, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h: string) => h.trim(),
    })

    return (result.data as Record<string, string>[]).map(row => ({
      firstName: (row['First Name'] || '').trim(),
      lastName: (row['Last Name'] || '').trim(),
      url: (row['URL'] || '').trim(),
      company: (row['Company'] || '').trim(),
      position: (row['Position'] || '').trim(),
    })).filter(c => c.firstName || c.lastName)
  } catch {
    return []
  }
}
