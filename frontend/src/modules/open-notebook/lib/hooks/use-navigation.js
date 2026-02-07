import { useNavigationStore } from '@/modules/open-notebook/lib/stores/navigation-store'

export function useNavigation() {
  const store = useNavigationStore()

  return {
    setReturnTo: store.setReturnTo,
    clearReturnTo: store.clearReturnTo,
    getReturnPath: store.getReturnPath,
    getReturnLabel: store.getReturnLabel,
    returnTo: store.returnTo
  }
}
