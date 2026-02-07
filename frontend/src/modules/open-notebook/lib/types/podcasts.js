export const ACTIVE_EPISODE_STATUSES = [
  'running',
  'processing',
  'pending',
  'submitted',
]

export const FAILED_EPISODE_STATUSES = ['failed', 'error']

export function groupEpisodesByStatus(episodes) {
  return episodes.reduce(
    (groups, episode) => {
      const status = episode.job_status || 'unknown'

      if (status === 'running' || status === 'processing') {
        groups.running.push(episode)
        return groups
      }

      if (status === 'completed') {
        groups.completed.push(episode)
        return groups
      }

      if (FAILED_EPISODE_STATUSES.includes(status)) {
        groups.failed.push(episode)
        return groups
      }

      groups.pending.push(episode)
      return groups
    },
    { running: [], completed: [], failed: [], pending: [] }
  )
}

export function speakerUsageMap(speakerProfiles, episodeProfiles) {
  if (!speakerProfiles || !episodeProfiles) {
    return {}
  }

  const usage = {}

  for (const profile of speakerProfiles) {
    usage[profile.name] = 0
  }

  for (const episodeProfile of episodeProfiles) {
    const key = episodeProfile.speaker_config
    if (key in usage) {
      usage[key] += 1
    }
  }

  return usage
}
