'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { ConnectionErrorOverlay } from '@/components/errors/ConnectionErrorOverlay'
import { getConfig, getHealth, resetConfig } from '@/lib/config'

export function ConnectionGuard({ children }) {
  const [error, setError] = useState(null)
  const [isChecking, setIsChecking] = useState(true)
  const [bypass, setBypass] = useState(false)
  // Use a ref to track checking status to avoid dependency cycles
  const isCheckingRef = useRef(false)

  const checkConnection = useCallback(async () => {
    // Prevent re-entry if already checking
    if (isCheckingRef.current) {
      return
    }

    isCheckingRef.current = true
    setIsChecking(true)

    setError(null)

    // Reset config cache to force a fresh fetch
    resetConfig()

    try {
      await getHealth()
      const config = await getConfig()

      // Check if database is offline
      if (config.dbStatus === 'offline') {
        const dbError = {
          type: 'database-offline',
          details: {
            message: 'Database is offline', // Fallback message, UI will translate
            attemptedUrl: config.apiUrl,
          },
        }
        setError(dbError)
        isCheckingRef.current = false
        setIsChecking(false)
        return
      }

      // If we got here, connection is good
      setError(null)
      isCheckingRef.current = false
      setIsChecking(false)
    } catch (err) {
      // API is unreachable
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      const attemptedUrl =
        (err && err.attemptedUrl) ||
        (typeof window !== 'undefined'
          ? `${window.location.origin}/api/config`
          : undefined)

      const apiError = {
        type: 'api-unreachable',
        details: {
          message: 'Unable to connect to API', // Fallback message
          technicalMessage: errorMessage,
          stack: err instanceof Error ? err.stack : undefined,
          attemptedUrl,
        },
      }

      setError(apiError)
      isCheckingRef.current = false
      setIsChecking(false)
    }
  }, []) // Empty dependency array - stable callback

  // Check connection on mount
  useEffect(() => {
    checkConnection()
  }, [checkConnection])

  // Add keyboard shortcut for retry (R key)
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (error && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault()
        checkConnection()
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [error, checkConnection])

  // Show overlay if there's an error
  if (error) {
    if (!bypass) {
      return (
        <ConnectionErrorOverlay
          error={error}
          onRetry={checkConnection}
          onContinue={() => setBypass(true)}
        />
      )
    }
    return (
      <>
        <ConnectionStatusBanner error={error} onRetry={checkConnection} />
        {children}
      </>
    )
  }

  // Show nothing while checking (prevents flash of content)
  if (isChecking) {
    return null
  }

  // Render children if connection is good
  return <>{children}</>
}

function ConnectionStatusBanner({ error, onRetry }) {
  const message =
    error?.details?.message ||
    'API unreachable. You can continue, but features may not work.'

  return (
    <div className="w-full bg-primary-100 text-dark-900 border-b border-primary-200 px-4 py-2 text-sm flex items-center justify-between">
      <div className="truncate">{message}</div>
      <button
        onClick={onRetry}
        className="ml-4 px-3 py-1 rounded border border-primary-300 hover:bg-primary-200"
      >
        Retry
      </button>
    </div>
  )
}
