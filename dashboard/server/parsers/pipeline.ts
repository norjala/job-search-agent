export type PipelineStatus =
  | 'To Research'
  | 'Networking'
  | 'Ready to Apply'
  | 'Applied'
  | 'Interviewing'
  | 'Hold'
  | 'Rejected'
  | 'Closed'

export interface PipelineRow {
  rank: number
  company: string
  role: string
  roleUrl: string | null
  location: string
  status: PipelineStatus
  whyItMatters: string
  source: string
  dateFound: string
  lastTouched: string
  nextAction: string
  notes: string
}

const VALID_STATUSES: PipelineStatus[] = [
  'To Research', 'Networking', 'Ready to Apply', 'Applied',
  'Interviewing', 'Hold', 'Rejected', 'Closed'
]

function extractLink(cell: string): { text: string; url: string | null } {
  const match = cell.match(/\[([^\]]*)\]\(([^)]*)\)/)
  if (match) {
    return { text: match[1], url: match[2] }
  }
  return { text: cell, url: null }
}

function parseCells(line: string): string[] {
  // Split on | but handle the leading and trailing pipes
  const trimmed = line.trim()
  if (!trimmed.startsWith('|')) return []
  // Remove leading/trailing pipes and split
  const inner = trimmed.slice(1, trimmed.endsWith('|') ? -1 : undefined)
  return inner.split('|').map(c => c.trim())
}

function isSeparatorRow(line: string): boolean {
  return /^\|[\s-:|]+\|$/.test(line.trim())
}

function isTableRow(line: string): boolean {
  return line.trim().startsWith('|') && line.trim().endsWith('|')
}

export function parsePipeline(content: string): PipelineRow[] {
  const lines = content.split('\n')
  const rows: PipelineRow[] = []

  // Find the header row (starts with | Rank or |Rank)
  let headerIdx = -1
  for (let i = 0; i < lines.length; i++) {
    const cells = parseCells(lines[i])
    if (cells.length > 0 && cells[0].toLowerCase().includes('rank')) {
      headerIdx = i
      break
    }
  }

  if (headerIdx === -1) return rows

  // Skip separator row (headerIdx + 1)
  const dataStart = headerIdx + 2

  for (let i = dataStart; i < lines.length; i++) {
    const line = lines[i]
    if (!isTableRow(line)) break
    if (isSeparatorRow(line)) continue

    const cells = parseCells(line)
    if (cells.length < 2) continue

    const roleLink = extractLink(cells[2] || '')
    const rankNum = parseInt(cells[0], 10)
    const statusRaw = (cells[4] || '').trim()
    const status = VALID_STATUSES.includes(statusRaw as PipelineStatus)
      ? (statusRaw as PipelineStatus)
      : 'To Research'

    rows.push({
      rank: isNaN(rankNum) ? 4 : rankNum,
      company: (cells[1] || '').trim(),
      role: roleLink.text.trim(),
      roleUrl: roleLink.url,
      location: (cells[3] || '').trim(),
      status,
      whyItMatters: (cells[5] || '').trim(),
      source: (cells[6] || '').trim(),
      dateFound: (cells[7] || '').trim(),
      lastTouched: (cells[8] || '').trim(),
      nextAction: (cells[9] || '').trim(),
      notes: (cells[10] || '').trim(),
    })
  }

  return rows
}

export function serializePipeline(rows: PipelineRow[], originalContent: string): string {
  const lines = originalContent.split('\n')

  // Find header row
  let headerIdx = -1
  for (let i = 0; i < lines.length; i++) {
    const cells = parseCells(lines[i])
    if (cells.length > 0 && cells[0].toLowerCase().includes('rank')) {
      headerIdx = i
      break
    }
  }

  if (headerIdx === -1) return originalContent

  // Find the end of the table
  const separatorIdx = headerIdx + 1
  const dataStart = headerIdx + 2
  let dataEnd = dataStart

  for (let i = dataStart; i < lines.length; i++) {
    if (!isTableRow(lines[i]) || isSeparatorRow(lines[i])) {
      dataEnd = i
      break
    }
    dataEnd = i + 1
  }

  // Serialize rows
  const serializedRows = rows.map(row => {
    const roleCell = row.roleUrl ? `[${row.role}](${row.roleUrl})` : row.role
    return `| ${row.rank} | ${row.company} | ${roleCell} | ${row.location} | ${row.status} | ${row.whyItMatters} | ${row.source} | ${row.dateFound} | ${row.lastTouched} | ${row.nextAction} | ${row.notes} |`
  })

  // Reconstruct: everything before data rows + new data rows + everything after
  const before = lines.slice(0, dataStart)
  const after = lines.slice(dataEnd)

  return [...before, ...serializedRows, ...after].join('\n')
}
