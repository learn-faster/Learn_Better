import apiClient from './client'


export const insightsApi = {
  listForSource: async (sourceId) => {
    const response = await apiClient.get(`/sources/${sourceId}/insights`)
    return response.data
  },

  get: async (insightId) => {
    const response = await apiClient.get(`/insights/${insightId}`)
    return response.data
  },

  create: async (sourceId, data) => {
    const response = await apiClient.post(
      `/sources/${sourceId}/insights`,
      data
    )
    return response.data
  },

  delete: async (insightId) => {
    await apiClient.delete(`/insights/${insightId}`)
  },

  getCommandStatus: async (commandId) => {
    const response = await apiClient.get(
      `/commands/jobs/${commandId}`
    )
    return response.data
  },

  /**
   * Poll command status until completed or failed.
   * Returns true if completed successfully, false if failed.
   */
  waitForCommand: async (commandId, options) => {
    const maxAttempts = options?.maxAttempts ?? 60 // Default 60 attempts
    const intervalMs = options?.intervalMs ?? 2000 // Default 2 seconds

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const status = await insightsApi.getCommandStatus(commandId)
        if (status.status === 'completed') {
          return true
        }
        if (status.status === 'failed' || status.status === 'canceled') {
          console.error('Command failed:', status.error_message)
          return false
        }
        // Still running, wait and retry
        await new Promise(resolve => setTimeout(resolve, intervalMs))
      } catch (error) {
        console.error('Error checking command status:', error)
        // Continue polling on error
        await new Promise(resolve => setTimeout(resolve, intervalMs))
      }
    }
    // Timeout
    console.warn('Command polling timed out')
    return false
  }
}