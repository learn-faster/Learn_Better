import apiClient from './client'

export const notebooksApi = {
  list: async (params) => {
    const response = await apiClient.get('/notebooks', { params })
    return response.data
  },

  get: async (id) => {
    const response = await apiClient.get(`/notebooks/${id}`)
    return response.data
  },

  create: async (data) => {
    const response = await apiClient.post('/notebooks', data)
    return response.data
  },

  update: async (id, data) => {
    const response = await apiClient.put(`/notebooks/${id}`, data)
    return response.data
  },

  delete: async (id, deleteExclusiveSources = false) => {
    await apiClient.delete(`/notebooks/${id}`, {
      params: { delete_exclusive_sources: deleteExclusiveSources }
    })
  },

  deletePreview: async (id) => {
    const response = await apiClient.get(`/notebooks/${id}/delete-preview`)
    return response.data
  },

  removeSource: async (notebookId, sourceId) => {
    await apiClient.delete(`/notebooks/${notebookId}/sources/${sourceId}`)
  }
}
