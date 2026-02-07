import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
      retry: 2,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
})

export const QUERY_KEYS = {
  notebooks: ['notebooks'],
  notebook: (id) => ['notebooks', id],
  notes: (notebookId) => ['notes', notebookId],
  note: (id) => ['notes', id],
  sources: (notebookId) => ['sources', notebookId],
  sourcesInfinite: (notebookId) => ['sources', 'infinite', notebookId],
  source: (id) => ['sources', id],
  settings: ['settings'],
  sourceChatSessions: (sourceId) => ['source-chat', sourceId, 'sessions'],
  sourceChatSession: (sourceId, sessionId) => ['source-chat', sourceId, 'sessions', sessionId],
  notebookChatSessions: (notebookId) => ['notebook-chat', notebookId, 'sessions'],
  notebookChatSession: (sessionId) => ['notebook-chat', 'sessions', sessionId],
  podcastEpisodes: ['podcasts', 'episodes'],
  podcastEpisode: (episodeId) => ['podcasts', 'episodes', episodeId],
  episodeProfiles: ['podcasts', 'episode-profiles'],
  speakerProfiles: ['podcasts', 'speaker-profiles'],
}
