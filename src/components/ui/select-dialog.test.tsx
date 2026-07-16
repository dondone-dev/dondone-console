// @vitest-environment jsdom

import { useState } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select'

afterEach(cleanup)

beforeAll(() => {
  vi.stubGlobal('PointerEvent', MouseEvent)
  HTMLElement.prototype.hasPointerCapture = () => false
  HTMLElement.prototype.setPointerCapture = () => undefined
  HTMLElement.prototype.releasePointerCapture = () => undefined
  HTMLElement.prototype.scrollIntoView = () => undefined
})

afterAll(() => vi.unstubAllGlobals())

function SelectInsideDialog() {
  const [open, setOpen] = useState(true)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent dismissOnPointerDownOutside={false}>
        <DialogTitle>Policy</DialogTitle>
        <DialogDescription>Edit a usage policy.</DialogDescription>
        <button type="button">Dialog body</button>
        <Select defaultValue="active">
          <SelectTrigger aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
          </SelectContent>
        </Select>
      </DialogContent>
    </Dialog>
  )
}

describe('Select inside Dialog', () => {
  it('keeps the parent Dialog open when an open Select is dismissed inside it', async () => {
    const user = userEvent.setup()
    render(<SelectInsideDialog />)

    await user.click(screen.getByRole('combobox', { name: 'Status' }))
    expect(screen.getByRole('listbox')).toBeTruthy()

    const overlay = document.querySelector<HTMLDivElement>('div.fixed.inset-0')
    expect(overlay).not.toBeNull()
    await user.click(overlay!)

    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.queryByRole('dialog')).not.toBeNull()
  })
})
