import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  apiFetch,
  type ActiveCapability,
  type Service,
  type UsageControl,
  type UsagePolicy,
  type UsagePolicyRule,
} from '@/lib/api'
import type { Session } from '@/lib/auth'
import { validateUsagePolicyRules } from '@/lib/usage-policy-model'
import { Badge, StatusDot } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function ServiceUsagePoliciesTab({
  session,
  service,
}: {
  session: Session
  service: Service
}) {
  const [editingPolicyKey, setEditingPolicyKey] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const policies = useQuery({
    queryKey: ['usage-policies', service.key],
    queryFn: () =>
      apiFetch<{ policies: UsagePolicy[] }>(
        session,
        `/api/services/${service.key}/usage-policies`
      ),
  })

  const policyList = policies.data?.policies ?? []

  return (
    <div className="grid gap-3">
      {policies.isLoading && (
        <p className="text-sm text-muted-foreground">Loading usage policies…</p>
      )}
      {policies.isError && (
        <div className="flex items-center gap-2 text-xs text-destructive">
          Failed to load usage policies.
          <Button size="sm" variant="outline" onClick={() => void policies.refetch()}>
            Retry
          </Button>
        </div>
      )}
      {policies.isSuccess && policyList.length === 0 && !adding && (
        <p className="text-sm text-muted-foreground">No usage policies yet.</p>
      )}
      {policyList.map((policy) =>
        editingPolicyKey === policy.key ? (
          <PolicyForm
            key={policy.key}
            session={session}
            service={service}
            policy={policy}
            onDone={() => setEditingPolicyKey(null)}
          />
        ) : (
          <PolicySummaryRow
            key={policy.key}
            policy={policy}
            onEdit={() => setEditingPolicyKey(policy.key)}
          />
        )
      )}
      {adding ? (
        <PolicyForm session={session} service={service} onDone={() => setAdding(false)} />
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="justify-self-start"
          onClick={() => setAdding(true)}
        >
          <Plus />
          Add policy
        </Button>
      )}
    </div>
  )
}

function PolicySummaryRow({
  policy,
  onEdit,
}: {
  policy: UsagePolicy
  onEdit: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <div className="grid gap-0.5 text-sm leading-tight">
        <span className="flex items-center gap-1.5 font-medium">
          <StatusDot active={policy.status === 'active'} />
          {policy.name}
          <Badge variant="outline" className="font-mono font-normal text-muted-foreground">
            {policy.key}
          </Badge>
        </span>
        <span className="text-xs text-muted-foreground">
          {policy.description ?? 'No description'}
        </span>
        <span className="font-mono text-xs text-muted-foreground">
          {policy.rules.length} {policy.rules.length === 1 ? 'rule' : 'rules'}
        </span>
      </div>
      <Button size="sm" variant="ghost" onClick={onEdit}>
        Edit
      </Button>
    </div>
  )
}

function PolicyForm({
  session,
  service,
  policy,
  onDone,
}: {
  session: Session
  service: Service
  policy?: UsagePolicy
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [key, setKey] = useState(policy?.key ?? '')
  const [name, setName] = useState(policy?.name ?? '')
  const [description, setDescription] = useState(policy?.description ?? '')
  const [status, setStatus] = useState<'active' | 'disabled'>(policy?.status ?? 'active')
  const [rules, setRules] = useState<UsagePolicyRule[]>(policy?.rules ?? [])

  const activeCaps = useQuery({
    queryKey: ['active-capabilities', service.key],
    queryFn: () =>
      apiFetch<{ capabilities: ActiveCapability[] }>(
        session,
        `/api/services/${service.key}/capabilities`
      ),
  })

  const capList = useMemo(
    () => activeCaps.data?.capabilities ?? [],
    [activeCaps.data?.capabilities]
  )
  const controlledPermissions = useMemo(
    () => capList.filter((cap) => cap.usage_controls.length > 0),
    [capList]
  )

  const save = useMutation({
    mutationFn: () => {
      const body = {
        key: policy?.key ?? key,
        name,
        description: description || null,
        status,
        rules,
      }
      return policy
        ? apiFetch<UsagePolicy>(
            session,
            `/api/services/${service.key}/usage-policies/${policy.key}`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            }
          )
        : apiFetch<UsagePolicy>(session, `/api/services/${service.key}/usage-policies`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
    },
    onSuccess: () => {
      toast.success(`Policy "${name}" ${policy ? 'saved' : 'created'}`)
      void queryClient.invalidateQueries({ queryKey: ['usage-policies', service.key] })
      void queryClient.invalidateQueries({ queryKey: ['services'] })
      onDone()
    },
    onError: (error) =>
      toast.error(`Failed to ${policy ? 'save' : 'create'} policy`, {
        description: error instanceof Error ? error.message : undefined,
      }),
  })

  function addRule() {
    const firstPerm = controlledPermissions[0]
    const firstControl = firstPerm?.usage_controls[0]
    if (!firstPerm || !firstControl) return
    setRules((prev) => [
      ...prev,
      {
        permission_key: firstPerm.key,
        control_key: firstControl.key,
        value: defaultRuleValue(firstControl),
      },
    ])
  }

  function updateRule(index: number, patch: Partial<UsagePolicyRule>) {
    setRules((prev) =>
      prev.map((rule, i) => {
        if (i !== index) return rule
        const next = { ...rule, ...patch }
        if (patch.permission_key && patch.permission_key !== rule.permission_key) {
          const cap = controlledPermissions.find((c) => c.key === patch.permission_key)
          const control = cap?.usage_controls[0]
          if (control) {
            next.control_key = control.key
            next.value = defaultRuleValue(control)
          }
        }
        if (patch.control_key && patch.control_key !== rule.control_key) {
          const cap = controlledPermissions.find((c) => c.key === next.permission_key)
          const control = cap?.usage_controls.find((c) => c.key === patch.control_key)
          if (control) next.value = defaultRuleValue(control)
        }
        return next
      })
    )
  }

  function removeRule(index: number) {
    setRules((prev) => prev.filter((_, i) => i !== index))
  }

  const validation = useMemo(
    () => validateUsagePolicyRules(capList, rules),
    [capList, rules]
  )
  const canSave =
    Boolean(name) &&
    Boolean(policy || key) &&
    activeCaps.isSuccess &&
    validation.valid &&
    !save.isPending

  return (
    <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 dark:bg-muted/10">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
        <div className="grid gap-1.5">
          <Label htmlFor={`policy-name-${policy?.key ?? 'new'}`} className="text-xs text-muted-foreground">
            Name
          </Label>
          <Input
            id={`policy-name-${policy?.key ?? 'new'}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        {policy ? (
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as 'active' | 'disabled')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="grid gap-1.5">
            <Label htmlFor="policy-key-new" className="text-xs text-muted-foreground">
              Key
            </Label>
            <Input
              id="policy-key-new"
              placeholder="e.g. caller-limits"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </div>
        )}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`policy-description-${policy?.key ?? 'new'}`} className="text-xs text-muted-foreground">
          Description
        </Label>
        <Input
          id={`policy-description-${policy?.key ?? 'new'}`}
          placeholder="Optional"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">Rules</Label>
        {activeCaps.isLoading && (
          <p className="text-xs text-muted-foreground">Loading active catalog…</p>
        )}
        {activeCaps.isError && (
          <div className="flex items-center gap-2 text-xs text-destructive">
            Failed to load the active catalog.
            <Button size="sm" variant="outline" onClick={() => void activeCaps.refetch()}>
              Retry
            </Button>
          </div>
        )}
        {activeCaps.isSuccess && controlledPermissions.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No permissions with usage controls in the active catalog.
          </p>
        )}
        {controlledPermissions.length > 0 && (
          <div className="grid gap-2">
            {rules.map((rule, index) => (
              <RuleEditor
                key={index}
                rule={rule}
                capabilities={controlledPermissions}
                onChange={(patch) => updateRule(index, patch)}
                onRemove={() => removeRule(index)}
              />
            ))}
            <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={addRule}>
              <Plus />
              Add rule
            </Button>
          </div>
        )}
        {activeCaps.isSuccess && validation.errors.length > 0 && (
          <div className="grid gap-1 text-xs text-destructive">
            {validation.errors.map((error) => <span key={error}>{error}</span>)}
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => save.mutate()} disabled={!canSave}>
          {save.isPending && <RefreshCw className="animate-spin" />}
          {policy ? 'Save' : 'Create policy'}
        </Button>
      </div>
    </div>
  )
}

function RuleEditor({
  rule,
  capabilities,
  onChange,
  onRemove,
}: {
  rule: UsagePolicyRule
  capabilities: ActiveCapability[]
  onChange: (patch: Partial<UsagePolicyRule>) => void
  onRemove: () => void
}) {
  const permission = capabilities.find((cap) => cap.key === rule.permission_key)
  const controls = permission?.usage_controls ?? []
  const control = controls.find((entry) => entry.key === rule.control_key)

  return (
    <div className="grid gap-2 rounded border p-2 sm:grid-cols-[1fr_1fr_minmax(0,1fr)_auto] sm:items-end">
      <div className="grid gap-1">
        <Label className="text-[11px] text-muted-foreground">Permission</Label>
        <Select value={rule.permission_key} onValueChange={(value) => onChange({ permission_key: value })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {capabilities.map((cap) => (
              <SelectItem key={cap.key} value={cap.key}>
                {cap.key}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1">
        <Label className="text-[11px] text-muted-foreground">Control</Label>
        <Select
          value={rule.control_key}
          onValueChange={(value) => onChange({ control_key: value })}
          disabled={controls.length === 0}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {controls.map((entry) => (
              <SelectItem key={entry.key} value={entry.key}>
                {entry.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1">
        <Label className="text-[11px] text-muted-foreground">Value</Label>
        <RuleValueInput control={control} value={rule.value} onChange={(value) => onChange({ value })} />
      </div>
      <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label="Remove rule">
        <Trash2 />
      </Button>
    </div>
  )
}

function RuleValueInput({
  control,
  value,
  onChange,
}: {
  control?: UsageControl
  value: unknown
  onChange: (value: unknown) => void
}) {
  if (!control) {
    return <Input disabled placeholder="Select a control" />
  }

  if (control.kind === 'quota' || control.kind === 'rate_limit' || control.kind === 'numeric_ceiling') {
    return (
      <Input
        type="number"
        min={control.minimum}
        max={control.maximum}
        value={typeof value === 'number' ? value : ''}
        onChange={(e) => {
          const parsed = Number(e.target.value)
          onChange(Number.isFinite(parsed) ? parsed : '')
        }}
      />
    )
  }

  if (control.kind === 'enum_one') {
    return (
      <Select value={typeof value === 'string' ? value : ''} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select value" />
        </SelectTrigger>
        <SelectContent>
          {control.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  if (control.kind === 'enum_many') {
    const selected = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
    return (
      <div className="grid gap-1 rounded border p-2">
        {control.options.map((option) => (
          <label key={option.value} className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={selected.includes(option.value)}
              onCheckedChange={(checked) => {
                const next = new Set(selected)
                if (checked) next.add(option.value)
                else next.delete(option.value)
                onChange([...next])
              }}
            />
            {option.label}
          </label>
        ))}
      </div>
    )
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox checked={value === true} onCheckedChange={(checked) => onChange(checked === true)} />
      Allowed
    </label>
  )
}

function defaultRuleValue(control: UsageControl): unknown {
  if (control.kind === 'quota' || control.kind === 'rate_limit' || control.kind === 'numeric_ceiling') {
    return control.minimum
  }
  if (control.kind === 'enum_one') return control.options[0]?.value ?? ''
  if (control.kind === 'enum_many') return control.options[0] ? [control.options[0].value] : []
  return false
}
