import { NavLink, Outlet } from 'react-router-dom'
import { Boxes, KeyRound, LogOut, ScrollText, Settings, Users } from 'lucide-react'
import type { ConsoleContext } from '@/lib/console-context'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ThemeToggle } from '@/components/theme'

const NAV_ITEMS = [
  { to: '/users', label: 'Users', icon: Users },
  { to: '/services', label: 'Services', icon: Boxes },
  { to: '/activity', label: 'Activity', icon: ScrollText },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function ConsoleLayout(context: ConsoleContext) {
  const { session, signOut } = context
  const initial = (session.email || '?').charAt(0).toUpperCase()

  return (
    <div className="flex min-h-svh bg-background">
      <aside className="sticky top-0 flex h-svh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs">
            <KeyRound className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold leading-tight">Dondone Console</div>
            <div className="text-xs text-muted-foreground">Permissions</div>
          </div>
        </div>

        <nav className="grid gap-0.5 px-3 py-2">
          <div className="px-3 pb-1.5 pt-2 text-xs font-medium text-muted-foreground">Platform</div>
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'relative flex h-9 items-center gap-2.5 rounded-md px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                  isActive
                    ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground before:absolute before:-left-3 before:top-1/2 before:h-4 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-primary'
                    : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={cn('size-4', isActive && 'text-primary')} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto">
          <Separator className="bg-sidebar-border" />
          <div className="flex items-center gap-2 px-3 py-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {initial}
            </div>
            <div className="min-w-0 flex-1 text-xs">
              <div className="truncate font-medium">{session.email || 'Administrator'}</div>
              <div className="text-muted-foreground">Console admin</div>
            </div>
            <ThemeToggle />
            <Button variant="ghost" size="icon" aria-label="Sign out" onClick={signOut}>
              <LogOut />
            </Button>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-8 py-7">
        <div className="mx-auto grid w-full max-w-6xl gap-6">
          <Outlet context={context} />
        </div>
      </main>
    </div>
  )
}
