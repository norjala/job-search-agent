import { marked } from 'marked'

// Configure marked for GFM
marked.setOptions({
  gfm: true,
  breaks: true,
})

export function renderMarkdown(content: string): string {
  return marked.parse(content, { async: false }) as string
}
