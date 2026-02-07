import apiClient from './client'

export const notesApi = {
  list: async (params) => {
    const response = await apiClient.get('/notes', { params })
    return response.data
  },

  get: async (id) => {
    const response = await apiClient.get(`/notes/${id}`)
    return response.data
  },

  create: async (data) => {
    const response = await apiClient.post('/notes', data)
    return response.data
  },

  update: async (id, data) => {
    const response = await apiClient.put(`/notes/${id}`, data)
    return response.data
  },

  delete: async (id) => {
    await apiClient.delete(`/notes/${id}`)
  }
}
