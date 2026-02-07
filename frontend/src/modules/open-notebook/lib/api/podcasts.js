import apiClient from './client'
import { getApiUrl } from '../config'

export async function resolvePodcastAssetUrl(path) {
  if (!path) {
    return undefined
  }

  if (/^https?:\/\//i.test(path)) {
    return path
  }

  const base = await getApiUrl()

  if (path.startsWith('/')) {
    return `${base}${path}`
  }

  return `${base}/${path}`
}

export const podcastsApi = {
  listEpisodes: async () => {
    const response = await apiClient.get('/podcasts/episodes')
    return response.data
  },

  deleteEpisode: async (episodeId) => {
    await apiClient.delete(`/podcasts/episodes/${episodeId}`)
  },

  listEpisodeProfiles: async () => {
    const response = await apiClient.get('/episode-profiles')
    return response.data
  },

  createEpisodeProfile: async (payload) => {
    const response = await apiClient.post(
      '/episode-profiles',
      payload
    )
    return response.data
  },

  updateEpisodeProfile: async (profileId, payload) => {
    const response = await apiClient.put(
      `/episode-profiles/${profileId}`,
      payload
    )
    return response.data
  },

  deleteEpisodeProfile: async (profileId) => {
    await apiClient.delete(`/episode-profiles/${profileId}`)
  },

  duplicateEpisodeProfile: async (profileId) => {
    const response = await apiClient.post(
      `/episode-profiles/${profileId}/duplicate`
    )
    return response.data
  },

  listSpeakerProfiles: async () => {
    const response = await apiClient.get('/speaker-profiles')
    return response.data
  },

  createSpeakerProfile: async (payload) => {
    const response = await apiClient.post(
      '/speaker-profiles',
      payload
    )
    return response.data
  },

  updateSpeakerProfile: async (profileId, payload) => {
    const response = await apiClient.put(
      `/speaker-profiles/${profileId}`,
      payload
    )
    return response.data
  },

  deleteSpeakerProfile: async (profileId) => {
    await apiClient.delete(`/speaker-profiles/${profileId}`)
  },

  duplicateSpeakerProfile: async (profileId) => {
    const response = await apiClient.post(
      `/speaker-profiles/${profileId}/duplicate`
    )
    return response.data
  },

  generatePodcast: async (payload) => {
    const response = await apiClient.post(
      '/podcasts/generate',
      payload
    )
    return response.data
  },
}
