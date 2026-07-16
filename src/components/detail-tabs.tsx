import { useRef } from 'react'
import { cn } from '@/lib/utils'

export interface DetailTabItem<T extends string> {
  id: T
  label: string
}

export function DetailTabs<T extends string>(props: {
  items: DetailTabItem<T>[]
  value: T
  ariaLabel: string
  idPrefix: string
  onValueChange: (value: T) => void
}): React.ReactElement {
  const { items, value, ariaLabel, idPrefix, onValueChange } = props
  const tabRefs = useRef<Map<T, HTMLButtonElement>>(new Map())

  const focusTab = (id: T) => {
    onValueChange(id)
    window.requestAnimationFrame(() => tabRefs.current.get(id)?.focus())
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const idx = items.findIndex((item) => item.id === value)
    if (idx === -1) return

    let next: T | undefined
    switch (e.key) {
      case 'ArrowRight':
        next = items[(idx + 1) % items.length].id
        break
      case 'ArrowLeft':
        next = items[(idx - 1 + items.length) % items.length].id
        break
      case 'Home':
        next = items[0].id
        break
      case 'End':
        next = items[items.length - 1].id
        break
      default:
        return
    }
    e.preventDefault()
    focusTab(next)
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex gap-1 border-b"
      onKeyDown={handleKeyDown}
    >
      {items.map((item) => {
        const selected = item.id === value
        return (
          <button
            key={item.id}
            ref={(el) => {
              if (el) tabRefs.current.set(item.id, el)
              else tabRefs.current.delete(item.id)
            }}
            role="tab"
            id={`${idPrefix}-tab-${item.id}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${item.id}`}
            tabIndex={selected ? 0 : -1}
            className={cn(
              'relative px-4 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
              selected
                ? 'text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => onValueChange(item.id)}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

export function DetailTabPanel(props: {
  active: boolean
  id: string
  tabId: string
  children: React.ReactNode
}): React.ReactElement | null {
  if (!props.active) return null
  return (
    <div
      role="tabpanel"
      id={props.id}
      aria-labelledby={props.tabId}
      tabIndex={0}
    >
      {props.children}
    </div>
  )
}
