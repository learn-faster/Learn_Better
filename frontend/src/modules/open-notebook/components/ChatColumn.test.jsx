import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ChatColumn } from './ChatColumn'
import { useSources } from '@/modules/open-notebook/lib/hooks/use-sources'
import { useNotes } from '@/modules/open-notebook/lib/hooks/use-notes'
import { useNotebookChat } from '@/modules/open-notebook/lib/hooks/useNotebookChat'

// Mock the hooks
vi.mock('@/modules/open-notebook/lib/hooks/use-sources')
vi.mock('@/modules/open-notebook/lib/hooks/use-notes')
vi.mock('@/modules/open-notebook/lib/hooks/useNotebookChat')
vi.mock('@/components/source/ChatPanel', () => ({
  ChatPanel: () => <div data-testid="chat-panel" />
}))

// Type-safe mock factory for useSources hook
function createSourcesMock(overrides: { isLoading?: boolean } = {}) {
  return {
    data: [],
    isLoading: overrides.isLoading ?? false,
  } as unknown<typeof useSources>
}

// Type-safe mock factory for useNotes hook
function createNotesMock(overrides: { isLoading?: boolean } = {}) {
  return {
    data: [],
    isLoading: overrides.isLoading ?? false,
  } as unknown<typeof useNotes>
}

// Type-safe mock factory for useNotebookChat hook
function createChatMock() {
  return {
    messages: [],
    isSending: false,
    tokenCount: 0,
    charCount: 0,
    sessions: [],
    currentSessionId: null,
  } as unknown<typeof useNotebookChat>
}

describe('ChatColumn', () => {
  const mockProps = {
    notebookId: 'test-notebook',
    contextSelections: {
      sources: {},
      notes: {}
    }
  }

  it('shows loading spinner when fetching data', () => {
    vi.mocked(useSources).mockReturnValue(createSourcesMock({ isLoading: true }))
    vi.mocked(useNotes).mockReturnValue(createNotesMock({ isLoading: true }))
    vi.mocked(useNotebookChat).mockReturnValue(createChatMock())

    render(<ChatColumn {...mockProps} />)
    
    // Should show loading spinner
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument()
  })

  it('renders chat panel when data is loaded', () => {
    vi.mocked(useSources).mockReturnValue(createSourcesMock({ isLoading: false }))
    vi.mocked(useNotes).mockReturnValue(createNotesMock({ isLoading: false }))
    vi.mocked(useNotebookChat).mockReturnValue(createChatMock())

    render(<ChatColumn {...mockProps} />)
    
    // Should show chat panel
    expect(screen.getByTestId('chat-panel')).toBeInTheDocument()
  })
})
