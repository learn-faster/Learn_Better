import apiClient from './client'

export const embeddingApi = {
  embedContent: async (itemId, itemType, asyncProcessing = false) => {
    const response = await apiClient.post('/embed', {
      item_id: itemId,
      item_type: itemType,
      async_processing: asyncProcessing
    })
    return response.data
  },

  rebuildEmbeddings: async (request) => {
    const response = await apiClient.post('/embeddings/rebuild', request)
    return response.data
  },

  getRebuildStatus: async (commandId) => {
    const response = await apiClient.get(`/embeddings/rebuild/${commandId}/status`)
    return response.data
  }
}
