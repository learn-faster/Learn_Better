import apiClient from './client'


export const sourcesApi = {
  list: async (params) => {
    const response = await apiClient.get('/sources', { params })
    return response.data
  },

  get: async (id) => {
    const response = await apiClient.get(`/sources/${id}`)
    return response.data
  },

  create: async (data) => {
    // Always use FormData to match backend expectations
    const formData = new FormData()

    // Add basic fields
    formData.append('type', data.type)

    if (data.notebooks !== undefined) {
      formData.append('notebooks', JSON.stringify(data.notebooks))
    }
    if (data.notebook_id) {
      formData.append('notebook_id', data.notebook_id)
    }
    if (data.title) {
      formData.append('title', data.title)
    }
    if (data.url) {
      formData.append('url', data.url)
    }
    if (data.content) {
      formData.append('content', data.content)
    }
    if (data.transformations !== undefined) {
      formData.append('transformations', JSON.stringify(data.transformations))
    }

    if (data.file instanceof File) {
      formData.append('file', data.file)
    }

    formData.append('embed', String(data.embed ?? false))
    formData.append('delete_source', String(data.delete_source ?? false))
    formData.append('async_processing', String(data.async_processing ?? false))

    const response = await apiClient.post('/sources', formData)
    return response.data
  },

  update: async (id, data) => {
    const response = await apiClient.put(`/sources/${id}`, data)
    return response.data
  },

  delete: async (id) => {
    await apiClient.delete(`/sources/${id}`)
  },

  status: async (id) => {
    const response = await apiClient.get(`/sources/${id}/status`)
    return response.data
  },

  upload: async (file, notebook_id) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('notebook_id', notebook_id)
    formData.append('type', 'upload')
    formData.append('async_processing', 'true')

    const response = await apiClient.post('/sources', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  },

  retry: async (id) => {
    const response = await apiClient.post(`/sources/${id}/retry`)
    return response.data
  },

  downloadFile: async (id) => {
    return apiClient.get(`/sources/${id}/download`, {
      responseType: 'blob',
    })
  },
}
