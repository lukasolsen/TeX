import { Braces } from "lucide-react"

import { cn } from "@/lib/utils"

export function AppBrand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5" aria-label="TeX">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs">
        <Braces aria-hidden="true" />
      </span>
      <span
        className={cn(
          "font-heading text-[15px] font-semibold tracking-[-0.02em]",
          compact && "sr-only"
        )}
      >
        TeX
      </span>
    </div>
  )
}
