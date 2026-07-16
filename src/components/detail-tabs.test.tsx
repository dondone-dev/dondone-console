// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DetailTabPanel, DetailTabs, type DetailTabItem } from './detail-tabs'

afterEach(cleanup)

const items: DetailTabItem<'overview' | 'access'>[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'access', label: 'Access' },
]

describe('DetailTabs', () => {
  it('renders tabs with correct ARIA state', () => {
    render(
      <DetailTabs
        items={items}
        value="overview"
        ariaLabel="User tabs"
        idPrefix="ut"
        onValueChange={() => {}}
      />
    )
    const tablist = screen.getByRole('tablist', { name: 'User tabs' })
    expect(tablist).toBeTruthy()

    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(2)
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
    expect(tabs[1].getAttribute('aria-selected')).toBe('false')
  })

  it('fires onValueChange on click', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <DetailTabs
        items={items}
        value="overview"
        ariaLabel="tabs"
        idPrefix="ut"
        onValueChange={onChange}
      />
    )
    await user.click(screen.getByRole('tab', { name: 'Access' }))
    expect(onChange).toHaveBeenCalledWith('access')
  })

  it('ArrowRight wraps from last to first', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <DetailTabs
        items={items}
        value="access"
        ariaLabel="tabs"
        idPrefix="ut"
        onValueChange={onChange}
      />
    )
    screen.getByRole('tab', { name: 'Access' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenCalledWith('overview')
  })

  it('ArrowLeft wraps from first to last', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <DetailTabs
        items={items}
        value="overview"
        ariaLabel="tabs"
        idPrefix="ut"
        onValueChange={onChange}
      />
    )
    screen.getByRole('tab', { name: 'Overview' }).focus()
    await user.keyboard('{ArrowLeft}')
    expect(onChange).toHaveBeenCalledWith('access')
  })

  it('Home selects first tab', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <DetailTabs
        items={items}
        value="access"
        ariaLabel="tabs"
        idPrefix="ut"
        onValueChange={onChange}
      />
    )
    screen.getByRole('tab', { name: 'Access' }).focus()
    await user.keyboard('{Home}')
    expect(onChange).toHaveBeenCalledWith('overview')
  })

  it('End selects last tab', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <DetailTabs
        items={items}
        value="overview"
        ariaLabel="tabs"
        idPrefix="ut"
        onValueChange={onChange}
      />
    )
    screen.getByRole('tab', { name: 'Overview' }).focus()
    await user.keyboard('{End}')
    expect(onChange).toHaveBeenCalledWith('access')
  })
})

describe('DetailTabPanel', () => {
  it('renders children when active', () => {
    render(
      <DetailTabPanel active id="panel-overview" tabId="tab-overview">
        <div>Content</div>
      </DetailTabPanel>
    )
    expect(screen.getByRole('tabpanel')).toBeTruthy()
    expect(screen.getByText('Content')).toBeTruthy()
  })

  it('returns null when inactive', () => {
    const { container } = render(
      <DetailTabPanel active={false} id="panel-access" tabId="tab-access">
        <div>Hidden</div>
      </DetailTabPanel>
    )
    expect(container.innerHTML).toBe('')
  })
})
