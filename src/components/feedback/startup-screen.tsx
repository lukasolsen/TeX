import { LoaderCircle } from "lucide-react"

import { AppBrand } from "@/components/brand/app-brand"
import { Skeleton } from "@/components/ui/skeleton"

/** Renders the stable startup shell while local workspace state is restored. */
export function StartupScreen() {
  return (
    <main
      aria-label="Starting TeX"
      className="relative flex min-h-svh items-center justify-center overflow-hidden bg-home-surface px-6"
    >
      <div
        aria-hidden="true"
        className="absolute size-80 rounded-full border border-primary/10 bg-primary/5 blur-3xl motion-safe:animate-pulse"
      />
      <section
        aria-live="polite"
        className="relative flex w-full max-w-xs flex-col items-center gap-5 rounded-2xl border bg-background/80 px-7 py-8 text-center shadow-sm backdrop-blur-sm"
        role="status"
      >
        <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <LoaderCircle
            aria-hidden="true"
            className="size-5 motion-safe:animate-spin"
          />
        </div>
        <AppBrand />
        <div className="flex w-full flex-col gap-2.5">
          <Skeleton className="h-1.5 w-full rounded-full" />
          <Skeleton className="h-1.5 w-3/5 self-center rounded-full" />
        </div>
        <span className="text-sm text-muted-foreground">
          Restoring local workspace…
        </span>
      </section>
    </main>
  )
}
