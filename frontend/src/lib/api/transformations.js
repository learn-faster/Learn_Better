import apiClient from './client'

export const transformationsApi = {
  list: async () => {
    const response = await apiClient.get('/transformations')
    return response.data
  },

  get: async (id) => {
    const response = await apiClient.get(`/transformations/${id}`)
    return response.data
  },

  create: async (data) => {
    const response = await apiClient.post('/transformations', data)
    return response.data
  },

  update: async (id, data) => {
    const response = await apiClient.put(`/transformations/${id}`, data)
    return response.data
  },

  delete: async (id) => {
    await apiClient.delete(`/transformations/${id}`)
  },

  execute: async (data) => {
    const response = await apiClient.post('/transformations/execute', data)
    return response.data
  },

  getDefaultPrompt: async () => {
    const response = await apiClient.get('/transformations/default-prompt')
    return response.data
  },

  updateDefaultPrompt: async (prompt) => {
    const response = await apiClient.put('/transformations/default-prompt', prompt)
    return response.data
  }
}
