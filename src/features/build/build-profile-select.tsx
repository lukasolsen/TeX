import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  isBuildEngine,
  type BuildEngine,
  type BuildProfile,
  type BuildProfilesState,
} from "@/domain/build"

export function BuildProfileSelect({
  disabled,
  engine,
  profiles,
  setEngine,
}: {
  disabled: boolean
  engine: BuildEngine
  profiles: BuildProfilesState
  setEngine: (engine: BuildEngine) => void
}) {
  const current =
    profiles.status === "ready"
      ? (profiles.profiles.find((profile) => profile.engine === engine) ?? null)
      : null
  return (
    <Select
      aria-label="Build profile"
      disabled={disabled || profiles.status !== "ready"}
      onValueChange={(value) => {
        if (isBuildEngine(value)) setEngine(value)
      }}
      value={engine}
    >
      <SelectTrigger
        aria-label="Build profile"
        className="w-40"
        size="sm"
        title={current?.description}
      >
        <SelectValue>
          {profiles.status === "loading"
            ? "Detecting tools…"
            : profiles.status === "error"
              ? "Profiles unavailable"
              : (current?.label ?? "Choose profile")}
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="end" className="min-w-72">
        <SelectGroup>
          {profiles.status === "ready"
            ? profiles.profiles.map((profile) => (
                <BuildProfileItem key={profile.engine} profile={profile} />
              ))
            : null}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

function BuildProfileItem({ profile }: { profile: BuildProfile }) {
  return (
    <SelectItem
      aria-label={`${profile.label}. ${profile.description}${profile.available ? "" : ` Unavailable because ${profile.executable} was not found.`}`}
      disabled={!profile.available}
      title={profile.description}
      value={profile.engine}
    >
      {profile.label}
      {!profile.available ? (
        <Badge variant="destructive">Not installed</Badge>
      ) : !profile.resolvesReferences ? (
        // Stated on the option itself, because choosing this profile silently
        // leaves every `\ref`, `\cite`, and table-of-contents entry unresolved.
        <Badge variant="secondary">No references</Badge>
      ) : profile.recommended ? (
        <Badge variant="secondary">Recommended</Badge>
      ) : null}
    </SelectItem>
  )
}
