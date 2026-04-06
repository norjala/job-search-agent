import { useState } from 'react'
import { X, Copy, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useCompany } from '@/lib/api'

interface CompanyDetailProps {
  slug: string
  onClose: () => void
}

export function CompanyDetail({ slug, onClose }: CompanyDetailProps) {
  const { data, isLoading, error } = useCompany(slug)
  const [copied, setCopied] = useState(false)

  const handleCopy = async (html: string) => {
    // Extract text content from HTML for clipboard
    const div = document.createElement('div')
    div.innerHTML = html
    const text = div.textContent || div.innerText || ''
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Determine available tabs
  const tabs: { value: string; label: string; html: string | null }[] = []
  if (data) {
    if (data.hasResearch) tabs.push({ value: 'research', label: 'Research', html: data.researchHtml })
    if (data.hasNetworking) tabs.push({ value: 'networking', label: 'Networking', html: data.networkingHtml })
    if (data.hasNotes) tabs.push({ value: 'notes', label: 'Notes', html: data.notesHtml })
    if (data.hasPrep) tabs.push({ value: 'prep', label: 'Prep', html: data.prepHtml })
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div className="relative w-full max-w-2xl bg-background border-l border-border shadow-2xl animate-in slide-in-from-right duration-200 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">
            {data?.name || slug}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        {isLoading && (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="flex-1 flex items-center justify-center text-destructive text-sm">
            Failed to load company: {error.message}
          </div>
        )}

        {data && tabs.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground px-6">
            <p className="text-sm">No research files yet for {data.name}.</p>
            <p className="text-xs text-muted-foreground/60">
              Run the agent or add files manually to companies/{slug}/
            </p>
          </div>
        )}

        {data && tabs.length > 0 && (
          <Tabs defaultValue={tabs[0].value} className="flex-1 flex flex-col min-h-0">
            <div className="px-6 pt-3">
              <TabsList>
                {tabs.map((tab) => (
                  <TabsTrigger key={tab.value} value={tab.value} className="text-xs">
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            <Separator className="mt-3" />

            {tabs.map((tab) => (
              <TabsContent key={tab.value} value={tab.value} className="flex-1 min-h-0 mt-0">
                <div className="relative h-full">
                  {tab.value === 'networking' && tab.html && (
                    <div className="absolute top-3 right-6 z-10">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopy(tab.html!)}
                        className="gap-1.5 text-xs"
                      >
                        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        {copied ? 'Copied' : 'Copy outreach'}
                      </Button>
                    </div>
                  )}
                  <ScrollArea className="h-[calc(100vh-180px)]">
                    <div className="px-6 py-4">
                      <div
                        className="prose text-sm"
                        dangerouslySetInnerHTML={{ __html: tab.html || '' }}
                      />
                    </div>
                  </ScrollArea>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>
    </div>
  )
}
