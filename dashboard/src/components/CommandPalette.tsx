import { useEffect, useState } from 'react'
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command'
import { useCompanies, useAddIntake } from '@/lib/api'
import { toast } from 'sonner'
import {
  LayoutDashboard,
  Table2,
  Building2,
  Users,
  Plus,
} from 'lucide-react'

interface CommandPaletteProps {
  onNavigate: (tab: string) => void
}

export function CommandPalette({ onNavigate }: CommandPaletteProps) {
  const [open, setOpen] = useState(false)
  const { data: companiesData } = useCompanies()
  const addIntake = useAddIntake()

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  const handleSelect = (action: string) => {
    setOpen(false)

    if (action.startsWith('tab:')) {
      onNavigate(action.replace('tab:', ''))
    } else if (action === 'add-role') {
      // Simple prompt-based intake for now
      const company = window.prompt('Company name:')
      if (!company) return
      const role = window.prompt('Role title:')
      if (!role) return
      const link = window.prompt('Job posting URL:') || ''
      const source = window.prompt('Source (LinkedIn, referral, etc):') || 'Manual'
      const notes = window.prompt('Notes (optional):') || ''

      addIntake.mutate(
        { company, role, link, source, notes },
        {
          onSuccess: () => toast.success(`Added ${role} at ${company} to intake`),
          onError: (err) => toast.error('Failed to add role', { description: err.message }),
        }
      )
    }
  }

  const companies = companiesData?.companies || []

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => handleSelect('tab:digest')}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            Go to Digest
          </CommandItem>
          <CommandItem onSelect={() => handleSelect('tab:pipeline')}>
            <Table2 className="mr-2 h-4 w-4" />
            Go to Pipeline
          </CommandItem>
          <CommandItem onSelect={() => handleSelect('tab:companies')}>
            <Building2 className="mr-2 h-4 w-4" />
            Go to Companies
          </CommandItem>
          <CommandItem onSelect={() => handleSelect('tab:network')}>
            <Users className="mr-2 h-4 w-4" />
            Go to Network
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => handleSelect('add-role')}>
            <Plus className="mr-2 h-4 w-4" />
            Add role to intake
          </CommandItem>
        </CommandGroup>

        {companies.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Companies">
              {companies.map((c) => (
                <CommandItem
                  key={c.slug}
                  onSelect={() => {
                    setOpen(false)
                    onNavigate('companies')
                  }}
                >
                  <Building2 className="mr-2 h-4 w-4" />
                  {c.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  )
}
