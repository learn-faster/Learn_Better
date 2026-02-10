import apiClient from './client'
import { getUserId } from '@/lib/utils/user-id'

const normalizeId = (value) => {
  if (!value) return value
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (typeof value === 'object') {
    if (value.tb && value.id) return `${value.tb}:${value.id}`
    if (value.table && value.id) return `${value.table}:${value.id}`
    if (value.id && typeof value.id === 'string') return value.id
    if (value.id && typeof value.id === 'number') return String(value.id)
    if (value.id && value.id.tb && value.id.id) return `${value.id.tb}:${value.id.id}`
  }
  return String(value)
}

const normalizeSession = (session) => {
  if (!session) return session
  return { ...session, id: normalizeId(session.id) }
}

export const chatApi = {
  // Session management
  listSessions: async (notebookId) => {
    const response = await apiClient.get(
      `/chat/sessions`,
      { params: { notebook_id: notebookId } }
    )
    const sessions = response.data || []
    return sessions.map(normalizeSession)
  },

  createSession: async (data) => {
    const response = await apiClient.post(
      `/chat/sessions`,
      data
    )
    return normalizeSession(response.data)
  },

  getSession: async (sessionId) => {
    const response = await apiClient.get(
      `/chat/sessions/${sessionId}`
    )
    return normalizeSession(response.data)
  },

  updateSession: async (sessionId, data) => {
    const response = await apiClient.put(
      `/chat/sessions/${sessionId}`,
      data
    )
    return normalizeSession(response.data)
  },

  deleteSession: async (sessionId) => {
    await apiClient.delete(`/chat/sessions/${sessionId}`)
  },

  // Messaging (synchronous, no streaming)
  sendMessage: async (data) => {
    const payload = { ...data, user_id: data?.user_id ?? getUserId() }
    const response = await apiClient.post(
      `/chat/execute`,
      payload
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
