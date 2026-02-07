import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { modelsApi } from '@/modules/open-notebook/lib/api/models'
import { useToast } from '@/modules/open-notebook/lib/hooks/use-toast'
import { useTranslation } from '@/modules/open-notebook/lib/hooks/use-translation'
import { getApiErrorKey } from '@/modules/open-notebook/lib/utils/error-handler'

export const MODEL_QUERY_KEYS = {
  models: ['models'],
  model: (id) => ['models', id],
  defaults: ['models', 'defaults'],
  providers: ['models', 'providers'],
}

export function useModels() {
  return useQuery({
    queryKey: MODEL_QUERY_KEYS.models,
    queryFn: () => modelsApi.list(),
  })
}

export function useModel(id) {
  return useQuery({
    queryKey: MODEL_QUERY_KEYS.model(id),
    queryFn: () => modelsApi.get(id),
    enabled: !!id,
  })
}

export function useCreateModel() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (data) => modelsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MODEL_QUERY_KEYS.models })
      toast({
        title: t.common.success,
        description: t.models.saveSuccess,
      })
    },
    onError: (error) => {
      toast({
        title: t.common.error,
        description: getApiErrorKey(error, t.common.error),
        variant: 'destructive',
      })
    },
  })
}

export function useDeleteModel() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (id) => modelsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MODEL_QUERY_KEYS.models })
      queryClient.invalidateQueries({ queryKey: MODEL_QUERY_KEYS.defaults })
      toast({
        title: t.common.success,
        description: t.models.deleteSuccess,
      })
    },
    onError: (error) => {
      toast({
        title: t.common.error,
        description: getApiErrorKey(error, t.common.error),
        variant: 'destructive',
      })
    },
  })
}

export function useModelDefaults() {
  return useQuery({
    queryKey: MODEL_QUERY_KEYS.defaults,
    queryFn: () => modelsApi.getDefaults(),
  })
}

export function useUpdateModelDefaults() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (data) => modelsApi.updateDefaults(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MODEL_QUERY_KEYS.defaults })
      toast({
        title: t.common.success,
        description: t.models.saveSuccess,
      })
    },
    onError: (error) => {
      toast({
        title: t.common.error,
        description: getApiErrorKey(error, t.common.error),
        variant: 'destructive',
      })
    },
  })
}

export function useProviders() {
  return useQuery({
    queryKey: MODEL_QUERY_KEYS.providers,
    queryFn: () => modelsApi.getProviders(),
  })
}
