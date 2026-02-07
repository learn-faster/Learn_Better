"use client"

import { useThemeStore } from "@/lib/stores/theme-store"
import { Toaster as Sonner } from "sonner"

const Toaster = ({ ...props }) => {
  const theme = useThemeStore((state) => state.theme)
  const systemTheme = useThemeStore((state) => state.getSystemTheme())
  const effectiveTheme = theme === 'system' ? systemTheme : theme

  return (
    <Sonner
      theme={effectiveTheme}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--success-bg": "var(--popover)",
          "--success-text": "var(--popover-foreground)",
          "--success-border": "var(--border)",
        }
      }
      {...props}
    />
  )
}

export { Toaster }
