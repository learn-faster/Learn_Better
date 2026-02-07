import apiClient from './client'

export const sourceChatApi = {
  // Session management
  createSession: async (sourceId, data) => {
    // Extract clean ID without "source:" prefix for the request body
    const cleanId = sourceId.startsWith('source:') ? sourceId.slice(7) : sourceId
    const response = await apiClient.post(
      `/sources/${sourceId}/chat/sessions`,
      { ...data, source_id: cleanId }  // Include source_id in the request body
    )
    return response.data
  },

  listSessions: async (sourceId) => {
    const response = await apiClient.get(
      `/sources/${sourceId}/chat/sessions`
    )
    return response.data
  },

  getSession: async (sourceId, sessionId) => {
    const response = await apiClient.get(
      `/sources/${sourceId}/chat/sessions/${sessionId}`
    )
    return response.data
  },

  updateSession: async (sourceId, sessionId, data) => {
    const response = await apiClient.put(
      `/sources/${sourceId}/chat/sessions/${sessionId}`,
      data
    )
    return response.data
  },

  deleteSession: async (sourceId, sessionId) => {
    await apiClient.delete(`/sources/${sourceId}/chat/sessions/${sessionId}`)
  },

  // Messaging with streaming
  sendMessage: (sourceId, sessionId, data) => {
    // Get auth token using the same logic as apiClient interceptor
    let token = null
    if (typeof window !== 'undefined') {
      const authStorage = localStorage.getItem('auth-storage')
      if (authStorage) {
        try {
          const { state } = JSON.parse(authStorage)
          if (state?.token) {
            token = state.token
          }
        } catch (error) {
          console.error('Error parsing auth storage:', error)
        }
      }
    }

    // Use relative URL to leverage Next.js rewrites
    // This works both in dev (Next.js proxy) and production (Docker network)
    const url = `/api/sources/${sourceId}/chat/sessions/${sessionId}/messages`

    // Use fetch with ReadableStream for SSE
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      },
      body: JSON.stringify(data)
    }).then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      return response.body
    })
  }
}
