import { create } from 'zustand'
import { persist } from 'zustand/middleware'


export const useNavigationStore = create()(
  persist(
    (set, get) => ({
      returnTo: undefined,

      setReturnTo: (path, label, preserveState) => set({
        returnTo: {
          path,
          label,
          preserveState: {
            ...preserveState,
            timestamp: Date.now()
          }
        }
      }),

      clearReturnTo: () => set({ returnTo: undefined }),

      getReturnPath: () => {
        const state = get()
        const returnTo = state.returnTo

        // Check if context is stale (older than 1 hour)
        if (returnTo?.preserveState?.timestamp) {
          const isStale = Date.now() - returnTo.preserveState.timestamp > 3600000
          if (isStale) {
            set({ returnTo: undefined })
            return '/sources'
          }
        }

        return returnTo?.path || '/sources'
      },

      getReturnLabel: () => {
        const state = get()
        const returnTo = state.returnTo

        // Check if context is stale (older than 1 hour)
        if (returnTo?.preserveState?.timestamp) {
          const isStale = Date.now() - returnTo.preserveState.timestamp > 3600000
          if (isStale) {
            set({ returnTo: undefined })
            return 'Back to Sources'
          }
        }

        return returnTo?.label || 'Back to Sources'
      }
    }),
    {
      name: 'navigation-storage',
      storage: {
        getItem: (name) => {
          try {
            const value = sessionStorage.getItem(name)
            return value
          } catch {
            return null
          }
        },
        setItem: (name, value) => {
          try {
            sessionStorage.setItem(name, value)
          } catch {
            // Silently fail if sessionStorage is not available
          }
        },
        removeItem: (name) => {
          try {
            sessionStorage.removeItem(name)
          } catch {
            // Silently fail if sessionStorage is not available
          }
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }
    }
  )
)
