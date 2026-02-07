import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notesApi } from '@/modules/open-notebook/lib/api/notes'
import { QUERY_KEYS } from '@/modules/open-notebook/lib/api/query-client'
import { useToast } from '@/modules/open-notebook/lib/hooks/use-toast'
import { useTranslation } from '@/modules/open-notebook/lib/hooks/use-translation'
import { getApiErrorKey } from '@/modules/open-notebook/lib/utils/error-handler'


export function useNotes(notebookId) {
  return useQuery({
    queryKey: QUERY_KEYS.notes(notebookId),
    queryFn: () => notesApi.list({ notebook_id: notebookId }),
    enabled: !!notebookId,
  })
}

export function useNote(id, options) {
  const noteId = id ?? ''
  return useQuery({
    queryKey: QUERY_KEYS.note(noteId),
    queryFn: () => notesApi.get(noteId),
    enabled: !!noteId && (options?.enabled ?? true),
  })
}

export function useCreateNote() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (data) => notesApi.create(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.notes(variables.notebook_id)
      })
      toast({
        title: t.common.success,
        description: t.notebooks.noteCreatedSuccess,
      })
    },
    onError: (error) => {
      toast({
        title: t.common.error,
        description: getApiErrorKey(error, t.notebooks.failedToCreateNote),
        variant: 'destructive',
      })
    },
  })
}

export function useUpdateNote() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: ({ id, data }) =>
      notesApi.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notes() })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.note(id) })
      toast({
        title: t.common.success,
        description: t.notebooks.noteUpdatedSuccess,
      })
    },
    onError: (error) => {
      toast({
        title: t.common.error,
        description: getApiErrorKey(error, t.notebooks.failedToUpdateNote),
        variant: 'destructive',
      })
    },
  })
}

export function useDeleteNote() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (id) => notesApi.delete(id),
    onSuccess: () => {
      // Invalidate all notes queries (with and without notebook IDs)
      queryClient.invalidateQueries({ queryKey: ['notes'] })
      toast({
        title: t.common.success,
        description: t.notebooks.noteDeletedSuccess,
      })
    },
    onError: (error) => {
      toast({
        title: t.common.error,
        description: getApiErrorKey(error, t.notebooks.failedToDeleteNote),
        variant: 'destructive',
      })
    },
  })
}
