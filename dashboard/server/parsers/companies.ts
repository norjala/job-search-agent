import { readdir, readFile, stat } from 'fs/promises'
import { join } from 'path'
import { renderMarkdown } from './markdown'

export interface CompanySummary {
  slug: string
  name: string
  hasResearch: boolean
  hasNetworking: boolean
  hasNotes: boolean
  hasPrep: boolean
  hasConversations: boolean
}

export interface CompanyDetail extends CompanySummary {
  researchHtml: string | null
  networkingHtml: string | null
  notesHtml: string | null
  prepHtml: string | null
}

function slugToName(slug: string): string {
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

export async function getCompanies(companiesDir: string): Promise<CompanySummary[]> {
  try {
    const entries = await readdir(companiesDir, { withFileTypes: true })
    const companies: CompanySummary[] = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const dir = join(companiesDir, entry.name)

      companies.push({
        slug: entry.name,
        name: slugToName(entry.name),
        hasResearch: await fileExists(join(dir, 'research.md')),
        hasNetworking: await fileExists(join(dir, 'networking.md')),
        hasNotes: await fileExists(join(dir, 'notes.md')),
        hasPrep: await fileExists(join(dir, 'prep.md')),
        hasConversations: await fileExists(join(dir, 'conversations')),
      })
    }

    return companies.sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    return []
  }
}

export async function getCompanyDetail(companiesDir: string, slug: string): Promise<CompanyDetail | null> {
  const dir = join(companiesDir, slug)

  if (!(await fileExists(dir))) return null

  async function readAndRender(filename: string): Promise<string | null> {
    const filepath = join(dir, filename)
    try {
      const content = await readFile(filepath, 'utf-8')
      return renderMarkdown(content)
    } catch {
      return null
    }
  }

  const [researchHtml, networkingHtml, notesHtml, prepHtml] = await Promise.all([
    readAndRender('research.md'),
    readAndRender('networking.md'),
    readAndRender('notes.md'),
    readAndRender('prep.md'),
  ])

  return {
    slug,
    name: slugToName(slug),
    hasResearch: researchHtml !== null,
    hasNetworking: networkingHtml !== null,
    hasNotes: notesHtml !== null,
    hasPrep: prepHtml !== null,
    hasConversations: await fileExists(join(dir, 'conversations')),
    researchHtml,
    networkingHtml,
    notesHtml,
    prepHtml,
  }
}
