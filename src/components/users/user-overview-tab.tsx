import { useState } from 'react'
import type { Service, UserDetail } from '@/lib/api'
import { countEffectiveServiceAssignments } from '@/lib/user-access-model'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export function UserOverviewTab(props: {
  detail: UserDetail
  services: Service[]
  nowMs?: number
  servicesError?: boolean
  onRetryServices?: () => void
}): React.ReactElement {
  const { detail, services } = props
  const [nowMs] = useState(() => props.nowMs ?? Date.now())
  const { profile, permissions } = detail
  const sorted = [...permissions].sort()
  const assignmentCount = countEffectiveServiceAssignments(detail.groups, services, nowMs)

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <Field label="Email" value={profile.email ?? 'Not provided'} />
          <Field label="Display name" value={profile.display_name ?? 'Not provided'} />
          <Field label="Status">
            <Badge variant="outline" className="capitalize text-muted-foreground">
              {profile.status}
            </Badge>
          </Field>
          <Field
            label="Created"
            value={new Date(profile.created_at).toLocaleString()}
          />
          <Field label="User ID">
            <span className="font-mono text-xs">{profile.id}</span>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Effective permissions</CardTitle>
          <CardDescription>
            Permissions currently granted through active, unexpired service Groups.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap gap-1">
            {sorted.length === 0 && (
              <span className="text-sm text-muted-foreground">No effective permissions.</span>
            )}
            {sorted.map((perm) => (
              <Badge key={perm} variant="secondary" className="font-mono text-[11px]">
                {perm}
              </Badge>
            ))}
          </div>
          {props.servicesError ? (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span>Failed to load services.</span>
              {props.onRetryServices && (
                <Button variant="link" size="sm" onClick={props.onRetryServices}>
                  Retry
                </Button>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {assignmentCount} active service access assignment{assignmentCount === 1 ? '' : 's'}.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Field(props: {
  label: string
  value?: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-muted-foreground">{props.label}</span>
      {props.children ?? <span>{props.value}</span>}
    </div>
  )
}
