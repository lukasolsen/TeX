import { CircleAlert, LoaderCircle } from "lucide-react"

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { OpenProjectFeedback } from "@/domain/project"

export function OpenProjectFeedbackView({
  feedback,
  onClear,
}: {
  feedback: OpenProjectFeedback
  onClear: () => void
}) {
  if (feedback.status === "idle") return null
  if (feedback.status === "error") {
    return (
      <Alert variant="destructive">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>Couldn&apos;t open that project</AlertTitle>
        <AlertDescription>{feedback.error.message}</AlertDescription>
        <AlertAction>
          <Button onClick={onClear} size="sm" variant="outline">
            Dismiss
          </Button>
        </AlertAction>
      </Alert>
    )
  }

  const message =
    feedback.status === "choosing"
      ? "Waiting for a folder…"
      : feedback.status === "opening"
        ? "Reading the project safely…"
        : "Folder selection cancelled."

  return (
    <p
      className="flex min-h-8 items-center gap-2 text-sm text-muted-foreground"
      role="status"
    >
      {feedback.status === "choosing" || feedback.status === "opening" ? (
        <LoaderCircle aria-hidden="true" className="animate-spin" />
      ) : null}
      {message}
    </p>
  )
}
