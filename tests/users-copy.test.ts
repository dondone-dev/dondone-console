import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Users permission panel', () => {
  it('describes effective permissions as coming from assigned roles', () => {
    const source = readFileSync(new URL('../src/pages/users.tsx', import.meta.url), 'utf8')

    expect(source).toContain(
      '<CardDescription>Effective permissions from assigned roles</CardDescription>'
    )
  })
})
