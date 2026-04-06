import { CalendarDays, Inbox } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useDigest } from '@/lib/api'

export function DigestView() {
  const { data, isLoading, error } = useDigest()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Loading digest...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20 text-destructive">
        Failed to load digest: {error.message}
      </div>
    )
  }

  if (!data || data.empty || !data.html) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Inbox className="h-12 w-12 text-muted-foreground/40" />
        <p className="text-muted-foreground text-sm">No daily digest yet.</p>
        <p className="text-muted-foreground/60 text-xs">
          Run the agent to generate today's digest with new role discoveries and action items.
        </p>
      </div>
    )
  }

  // Extract date from the first heading
  const dateMatch = data.html.match(/Daily Digest\s*(?:—|&mdash;)\s*(\d{4}-\d{2}-\d{2})/)
  const date = dateMatch ? dateMatch[1] : 'Today'

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <CalendarDays className="h-4 w-4" />
        <span>{date}</span>
      </div>

      {data.sections.length > 0 ? (
        <div className="space-y-4">
          {data.sections.map((section, i) => (
            <Card key={i} className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{section.title}</CardTitle>
              </CardHeader>
              <Separator />
              <CardContent className="pt-4">
                <ScrollArea className="max-h-[500px]">
                  <div
                    className="prose text-sm"
                    dangerouslySetInnerHTML={{ __html: section.content }}
                  />
                </ScrollArea>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-border/50">
          <CardContent className="pt-6">
            <ScrollArea className="max-h-[700px]">
              <div
                className="prose text-sm"
                dangerouslySetInnerHTML={{ __html: data.html }}
              />
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
