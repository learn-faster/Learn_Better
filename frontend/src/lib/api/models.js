import apiClient from './client'

export const modelsApi = {
  list: async () => {
    const response = await apiClient.get('/models')
    return response.data
  },

  get: async (id) => {
    const response = await apiClient.get(`/models/${id}`)
    return response.data
  },

  create: async (data) => {
    const response = await apiClient.post('/models', data)
    return response.data
  },

  delete: async (id) => {
    await apiClient.delete(`/models/${id}`)
  },

  getDefaults: async () => {
    const response = await apiClient.get('/models/defaults')
    return response.data
  },

  updateDefaults: async (data) => {
    const response = await apiClient.put('/models/defaults', data)
    return response.data
  },

  getProviders: async () => {
    const response = await apiClient.get('/models/providers')
    return response.data
  }
}
