import apiClient from './client'

export const chatApi = {
  // Session management
  listSessions: async (notebookId) => {
    const response = await apiClient.get(
      `/chat/sessions`,
      { params: { notebook_id: notebookId } }
    )
    return response.data
  },

  createSession: async (data) => {
    const response = await apiClient.post(
      `/chat/sessions`,
      data
    )
    return response.data
  },

  getSession: async (sessionId) => {
    const response = await apiClient.get(
      `/chat/sessions/${sessionId}`
    )
    return response.data
  },

  updateSession: async (sessionId, data) => {
    const response = await apiClient.put(
      `/chat/sessions/${sessionId}`,
      data
    )
    return response.data
  },

  deleteSession: async (sessionId) => {
    await apiClient.delete(`/chat/sessions/${sessionId}`)
  },

  // Messaging (synchronous, no streaming)
  sendMessage: async (data) => {
    const response = await apiClient.post(
      `/chat/execute`,
      data
    )
    return response.data
  },

  buildContext: async (data) => {
    const response = await apiClient.post(
      `/chat/context`,
      data
    )
    return response.data
  },
}

export default chatApi
