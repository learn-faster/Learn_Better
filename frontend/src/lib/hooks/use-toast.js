import { toast as sonnerToast } from 'sonner'
import { useTranslation } from '@/modules/open-notebook/lib/hooks/use-translation'



export function useToast() {
  const { t } = useTranslation()

  return {
    toast: ({ title, description, variant = 'default' }) => {
      if (variant === 'destructive') {
        sonnerToast.error(title || t.common.error, {
          description,
        })
      } else {
        sonnerToast.success(title || t.common.success, {
          description,
        })
      }
    }
  }
}
