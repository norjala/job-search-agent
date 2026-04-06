import { readFile, readdir } from 'fs/promises'
import { join, resolve } from 'path'
import { watch } from 'chokidar'
import { parsePipeline, serializePipeline } from './parsers/pipeline'
import { renderMarkdown } from './parsers/markdown'
import { getCompanies, getCompanyDetail } from './parsers/companies'
import { parseConnections } from './parsers/connections'
import type { PipelineStatus } from './parsers/pipeline'

const PORT = 3001
const VAULT_PATH = resolve(process.env.VAULT_PATH || join(import.meta.dir, '../../../../work/job-search'))

console.log(`[server] Vault path: ${VAULT_PATH}`)

// ─── WebSocket clients ───
const wsClients = new Set<{ send: (data: string) => void; close: () => void }>()

// ─── File watcher with debounce ───
let debounceTimer: ReturnType<typeof setTimeout> | null = null

const watcher = watch(VAULT_PATH, {
  ignoreInitial: true,
  ignored: /(^|[/\\])\../, // ignore dotfiles
  persistent: true,
})

watcher.on('all', (_event, path) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    const message = JSON.stringify({ type: 'file-changed', path })
    for (const client of wsClients) {
      try {
        client.send(message)
      } catch {
        wsClients.delete(client)
      }
    }
  }, 500)
})

// ─── Helpers ───
function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  })
}

function errorJson(message: string, status = 500): Response {
  return json({ error: message }, status)
}

async function readVaultFile(relativePath: string): Promise<string | null> {
  try {
    return await readFile(join(VAULT_PATH, relativePath), 'utf-8')
  } catch {
    return null
  }
}

// ─── Route handlers ───

async function handleDigest(): Promise<Response> {
  const content = await readVaultFile('_daily-digest.md')
  if (!content) {
    return json({ html: null, sections: [], empty: true })
  }

  const html = renderMarkdown(content)

  // Parse sections by ## headings
  const sections: { title: string; content: string }[] = []
  const sectionRegex = /^## (.+)$/gm
  let match: RegExpExecArray | null
  const matches: { title: string; start: number }[] = []

  while ((match = sectionRegex.exec(content)) !== null) {
    matches.push({ title: match[1], start: match.index })
  }

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].start
    const end = i + 1 < matches.length ? matches[i + 1].start : content.length
    const sectionContent = content.slice(start, end)
    sections.push({
      title: matches[i].title,
      content: renderMarkdown(sectionContent),
    })
  }

  return json({ html, sections })
}

async function handlePipeline(): Promise<Response> {
  const content = await readVaultFile('pipeline.md')
  if (!content) {
    return json({ rows: [], empty: true })
  }
  const rows = parsePipeline(content)
  return json({ rows })
}

async function handleCompanies(): Promise<Response> {
  const companiesDir = join(VAULT_PATH, 'companies')
  const companies = await getCompanies(companiesDir)
  return json({ companies })
}

async function handleCompanyDetail(slug: string): Promise<Response> {
  const companiesDir = join(VAULT_PATH, 'companies')
  const detail = await getCompanyDetail(companiesDir, slug)
  if (!detail) {
    return errorJson('Company not found', 404)
  }
  return json(detail)
}

async function handleNetwork(): Promise<Response> {
  const networkContent = await readVaultFile('my-network.md')
  const networkHtml = networkContent ? renderMarkdown(networkContent) : null
  const connections = await parseConnections(join(VAULT_PATH, 'linkedin-connections.csv'))
  return json({ networkHtml, connections })
}

async function handleIntake(): Promise<Response> {
  const content = await readVaultFile('_intake.md')
  if (!content) {
    return json({ html: null, sections: [], empty: true })
  }
  const html = renderMarkdown(content)

  // Parse sections by ## headings
  const sections: { title: string; content: string }[] = []
  const sectionRegex = /^## (.+)$/gm
  let match: RegExpExecArray | null
  const matches: { title: string; start: number }[] = []

  while ((match = sectionRegex.exec(content)) !== null) {
    matches.push({ title: match[1], start: match.index })
  }

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].start
    const end = i + 1 < matches.length ? matches[i + 1].start : content.length
    const sectionContent = content.slice(start, end)
    sections.push({
      title: matches[i].title,
      content: renderMarkdown(sectionContent),
    })
  }

  return json({ html, sections })
}

async function handleUpdatePipelineStatus(company: string, body: { status: string }): Promise<Response> {
  const VALID_STATUSES: PipelineStatus[] = [
    'To Research', 'Networking', 'Ready to Apply', 'Applied',
    'Interviewing', 'Hold', 'Rejected', 'Closed'
  ]

  if (!VALID_STATUSES.includes(body.status as PipelineStatus)) {
    return errorJson(`Invalid status: ${body.status}`, 400)
  }

  const filePath = join(VAULT_PATH, 'pipeline.md')
  const content = await readFile(filePath, 'utf-8')
  const rows = parsePipeline(content)

  const decodedCompany = decodeURIComponent(company)
  let updated = false

  for (const row of rows) {
    if (row.company.toLowerCase() === decodedCompany.toLowerCase()) {
      row.status = body.status as PipelineStatus
      row.lastTouched = new Date().toISOString().slice(0, 10)
      updated = true
    }
  }

  if (!updated) {
    return errorJson(`Company not found: ${decodedCompany}`, 404)
  }

  const newContent = serializePipeline(rows, content)
  await Bun.write(filePath, newContent)

  return json({ success: true, rows: parsePipeline(newContent) })
}

async function handleAddIntake(body: {
  company: string
  role: string
  link: string
  source: string
  notes: string
}): Promise<Response> {
  const filePath = join(VAULT_PATH, '_intake.md')
  let content: string
  try {
    content = await readFile(filePath, 'utf-8')
  } catch {
    content = '# Intake\n\n## New\n'
  }

  const entry = `\n- Company: ${body.company}\n  Role: ${body.role}\n  Link: ${body.link}\n  Source: ${body.source}\n  Notes: ${body.notes || 'none'}\n`

  // Find ## New section and append after it
  const newSectionIdx = content.indexOf('## New')
  if (newSectionIdx !== -1) {
    // Find the end of the "## New" line
    const lineEnd = content.indexOf('\n', newSectionIdx)
    const insertPoint = lineEnd !== -1 ? lineEnd : content.length
    content = content.slice(0, insertPoint) + entry + content.slice(insertPoint)
  } else {
    content += '\n## New' + entry
  }

  await Bun.write(filePath, content)
  return json({ success: true })
}

async function handleAgentRun(): Promise<Response> {
  try {
    const proc = Bun.spawn(
      ['claude', '--print', '--agent', 'job-search-agent', 'Run your daily workflow'],
      {
        cwd: VAULT_PATH,
        stdout: 'pipe',
        stderr: 'pipe',
      }
    )

    // Don't await — fire and forget, but collect output
    const output = await new Response(proc.stdout).text()
    const exitCode = await proc.exited

    return json({ success: exitCode === 0, output, exitCode })
  } catch (err) {
    return errorJson(`Failed to run agent: ${err}`)
  }
}

// ─── Server ───
const server = Bun.serve({
  port: PORT,
  hostname: '0.0.0.0',
  async fetch(req) {
    const url = new URL(req.url)
    const path = url.pathname

    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() })
    }

    // WebSocket upgrade
    if (path === '/ws') {
      const upgraded = server.upgrade(req)
      if (!upgraded) {
        return new Response('WebSocket upgrade failed', { status: 400 })
      }
      return undefined as unknown as Response
    }

    try {
      // GET routes
      if (req.method === 'GET') {
        if (path === '/api/digest') return handleDigest()
        if (path === '/api/pipeline') return handlePipeline()
        if (path === '/api/companies') return handleCompanies()
        if (path === '/api/network') return handleNetwork()
        if (path === '/api/intake') return handleIntake()

        // /api/companies/:slug
        const companyMatch = path.match(/^\/api\/companies\/(.+)$/)
        if (companyMatch) return handleCompanyDetail(companyMatch[1])
      }

      // POST routes
      if (req.method === 'POST') {
        // /api/pipeline/:company
        const pipelineMatch = path.match(/^\/api\/pipeline\/(.+)$/)
        if (pipelineMatch) {
          const body = await req.json()
          return handleUpdatePipelineStatus(pipelineMatch[1], body)
        }

        if (path === '/api/intake') {
          const body = await req.json()
          return handleAddIntake(body)
        }

        if (path === '/api/agent/run') {
          return handleAgentRun()
        }
      }

      return errorJson('Not found', 404)
    } catch (err) {
      console.error('[server] Error:', err)
      return errorJson(`Internal error: ${err}`)
    }
  },

  websocket: {
    open(ws) {
      wsClients.add(ws as unknown as { send: (data: string) => void; close: () => void })
    },
    message() {
      // We don't handle incoming WS messages
    },
    close(ws) {
      wsClients.delete(ws as unknown as { send: (data: string) => void; close: () => void })
    },
  },
})

console.log(`[server] Running on http://localhost:${PORT}`)
console.log(`[server] Watching ${VAULT_PATH} for changes`)
