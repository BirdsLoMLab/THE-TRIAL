import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ContentError } from '../../src/content/schema'

vi.mock('../../src/content', () => ({
  getContent: () => {
    throw new ContentError([
      'packs/core.json at cards.0.text: card text must not contain a double quote',
    ])
  },
}))

import { App } from '../../src/App'

describe('App', () => {
  it('shows the content error screen instead of the router when content is invalid', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Content failed to load' })).toBeInTheDocument()
    expect(screen.getByText(/must not contain a double quote/)).toBeInTheDocument()
  })
})
