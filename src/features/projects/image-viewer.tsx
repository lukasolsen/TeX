import { useEffect, useState, type ReactElement } from "react"
import { CircleAlert, Maximize2, Minus, Plus, Square } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import type { ProjectImage } from "@/domain/project"
import { formatBytes } from "@/lib/format"
import { cn } from "@/lib/utils"

const zoomSteps = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8]
const minZoom = 0.1
const maxZoom = 8

function nextZoom(zoom: number, direction: 1 | -1): number {
  const candidates = direction === 1 ? zoomSteps : zoomSteps.toReversed()
  return (
    candidates.find((step) =>
      direction === 1 ? step > zoom + 0.001 : step < zoom - 0.001
    ) ?? zoom
  )
}

type Dimensions = Readonly<{ width: number; height: number }>

/**
 * Displays a project image without claiming to edit it. The object URL is
 * created from and revoked with the bytes it renders, so no blob outlives the
 * file it came from.
 */
export function ImageViewer({ image }: { image: ProjectImage }): ReactElement {
  const [url, setUrl] = useState<string | null>(null)
  const [dimensions, setDimensions] = useState<Dimensions | null>(null)
  const [decodeFailed, setDecodeFailed] = useState(false)
  // `null` is fit-to-pane; a number is an explicit scale the user asked for.
  const [zoom, setZoom] = useState<number | null>(null)

  useEffect(() => {
    const blob = new Blob([image.bytes], { type: image.mediaType })
    const objectUrl = URL.createObjectURL(blob)
    setUrl(objectUrl)
    setDimensions(null)
    setDecodeFailed(false)
    setZoom(null)
    return () => URL.revokeObjectURL(objectUrl)
  }, [image])

  const scale = zoom ?? 1
  const scaledSize =
    zoom === null || dimensions === null
      ? null
      : {
          width: Math.max(1, Math.round(dimensions.width * scale)),
          height: Math.max(1, Math.round(dimensions.height * scale)),
        }

  return (
    <section
      aria-label={`Image viewer: ${image.path}`}
      className="flex min-h-0 flex-1 flex-col bg-source"
      data-workspace-focus="source"
      tabIndex={-1}
    >
      <div className="flex h-9 shrink-0 items-center gap-1 border-b bg-workspace-chrome px-2">
        <Button
          aria-label="Zoom out"
          disabled={zoom !== null && zoom <= minZoom}
          onClick={() => setZoom((current) => nextZoom(current ?? 1, -1))}
          size="icon-xs"
          variant="ghost"
        >
          <Minus />
        </Button>
        <span className="min-w-12 text-center text-meta text-muted-foreground">
          {zoom === null ? "Fit" : `${Math.round(zoom * 100)}%`}
        </span>
        <Button
          aria-label="Zoom in"
          disabled={zoom !== null && zoom >= maxZoom}
          onClick={() => setZoom((current) => nextZoom(current ?? 1, 1))}
          size="icon-xs"
          variant="ghost"
        >
          <Plus />
        </Button>
        <Separator className="mx-1 h-4" orientation="vertical" />
        <Button
          aria-pressed={zoom === null}
          onClick={() => setZoom(null)}
          size="xs"
          variant={zoom === null ? "secondary" : "ghost"}
        >
          <Maximize2 data-icon="inline-start" />
          Fit
        </Button>
        <Button
          aria-pressed={zoom === 1}
          onClick={() => setZoom(1)}
          size="xs"
          variant={zoom === 1 ? "secondary" : "ghost"}
        >
          <Square data-icon="inline-start" />
          Actual size
        </Button>
        <span className="ml-auto flex min-w-0 items-center gap-2 truncate text-meta text-muted-foreground">
          {dimensions === null ? null : (
            <span>{`${dimensions.width} × ${dimensions.height} px`}</span>
          )}
          <span>{formatBytes(image.bytes.byteLength)}</span>
        </span>
      </div>
      {decodeFailed ? (
        <div className="flex min-h-0 flex-1 items-start justify-center p-8">
          <Alert className="max-w-lg" variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Couldn&apos;t display {image.path}</AlertTitle>
            <AlertDescription>
              The file was read from your project, but its contents are not a
              readable {image.mediaType} image. The file on disk is unchanged.
            </AlertDescription>
          </Alert>
        </div>
      ) : (
        <div
          className={cn(
            "min-h-0 flex-1 overflow-auto p-4",
            zoom === null && "flex items-center justify-center"
          )}
        >
          {url === null ? null : (
            <img
              alt={`Contents of ${image.path}`}
              className={cn(
                "rounded-md border bg-card shadow-raised",
                zoom === null && "max-h-full max-w-full object-contain"
              )}
              height={scaledSize?.height}
              onError={() => setDecodeFailed(true)}
              onLoad={(event) =>
                setDimensions({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })
              }
              src={url}
              width={scaledSize?.width}
            />
          )}
        </div>
      )}
    </section>
  )
}
