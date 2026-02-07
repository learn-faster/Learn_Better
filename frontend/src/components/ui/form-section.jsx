"use client"


import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

export function FormSection({
  title,
  description,
  children,
  className,
  htmlFor
}) {
  return (
    <div className={cn("mb-6 last:mb-0", className)}>
      <div className="mb-4">
        {htmlFor ? (
          <Label htmlFor={htmlFor} className="text-base font-medium block mb-1">
            {title}
          </Label>
        ) : (
          <h3 className="text-base font-medium block mb-1">
            {title}
          </h3>
        )}
        {description && (
          <p className="text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      <div className="space-y-3">
        {children}
      </div>
    </div>
  )
}
