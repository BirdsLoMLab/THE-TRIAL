import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { getContent } from '../../src/content'
import { countCards } from '../../src/content/schema'
import { Home } from '../../src/routes/Home'

describe('Home (Phase 0 placeholder)', () => {
  it('shows the app name and the counts for every pack and level', () => {
    render(<Home />)
    expect(screen.getByTestId('app-name')).toHaveTextContent('Fathoms')
    for (const pack of countCards(getContent())) {
      expect(screen.getByTestId(`pack-${pack.packId}`)).toHaveTextContent(pack.name)
      for (const level of [1, 2, 3] as const) {
        expect(screen.getByTestId(`count-${pack.packId}-${level}`)).toHaveTextContent(
          String(pack.levels[level]),
        )
      }
      expect(screen.getByTestId(`count-${pack.packId}-currents`)).toHaveTextContent(
        String(pack.currents),
      )
      expect(screen.getByTestId(`count-${pack.packId}-total`)).toHaveTextContent(String(pack.total))
    }
  })

  it('marks After Dark as adults only', () => {
    render(<Home />)
    expect(screen.getByTestId('pack-afterdark')).toHaveTextContent('18+')
    expect(screen.getByTestId('pack-core')).not.toHaveTextContent('18+')
  })
})
