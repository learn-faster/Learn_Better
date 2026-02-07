'use client'

import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'


export function useModalManager() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const pathname = location.pathname

  // Read current modal state from URL params
  const modalType = searchParams?.get('modal') | null
  const modalId = searchParams?.get('id')

  /**
   * Open a modal by updating URL params without navigation
   * @param type - Type of modal to open (source, note, insight)
   * @param id - ID of the content to display
   */
  const openModal = (type, id) => {
    const params = new URLSearchParams(searchParams?.toString() || '')
    params.set('modal', type)
    params.set('id', id)
    navigate(`${pathname}?${params.toString()}`)
  }

  /**
   * Close the currently open modal by removing modal params from URL
   */
  const closeModal = () => {
    const params = new URLSearchParams(searchParams?.toString() || '')
    params.delete('modal')
    params.delete('id')
    navigate(`${pathname}?${params.toString()}`)
  }

  return {
    modalType,
    modalId,
    openModal,
    closeModal,
    isOpen: !!modalType && !!modalId
  }
}
