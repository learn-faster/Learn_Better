const STORAGE_KEY = 'open_notebook_user_id'

const generateUserId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  const randomPart = Math.random().toString(36).slice(2, 10)
  return `user_${Date.now()}_${randomPart}`
}

export const getUserId = () => {
  try {
    const existing = localStorage.getItem(STORAGE_KEY)
    if (existing) return existing

    const generated = generateUserId()
    localStorage.setItem(STORAGE_KEY, generated)
    return generated
  } catch (error) {
    return generateUserId()
  }
}

export default getUserId
