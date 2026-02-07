import { forwardRef, lazy, Suspense } from 'react'

const MDEditor = lazy(
  () => import('@uiw/react-md-editor').then((mod) => ({ default: mod.default }))
)


export const MarkdownEditor = forwardRef(
  ({ value = '', onChange, placeholder, height = 300, preview = 'live', hideToolbar = false, className, textareaId, name }, ref) => {
    return (
      <div className={className} ref={ref}>
        <Suspense fallback={<div style={{ height }} className="flex items-center justify-center border rounded-md">Loading editor...</div>}>
          <MDEditor
            value={value}
            onChange={onChange}
            preview={preview}
            height={height}
            hideToolbar={hideToolbar}
            textareaProps={{
              placeholder: placeholder || 'Enter markdown...',
              id: textareaId,
              name: name,
            }}
            data-color-mode="light"
          />
        </Suspense>
      </div>
    )
  }
)

MarkdownEditor.displayName = 'MarkdownEditor'