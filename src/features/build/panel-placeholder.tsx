import type { ReactNode } from "react"

export function PanelPlaceholder({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <p className="max-w-md text-center text-xs text-muted-foreground">
        {children}
      </p>
    </div>
  )
}
