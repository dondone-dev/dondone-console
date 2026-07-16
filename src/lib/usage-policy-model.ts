import type { ActiveCapability, UsageControl, UsagePolicyRule } from './api'

export interface UsagePolicyValidation {
  valid: boolean
  errors: string[]
}

function validValue(control: UsageControl, value: unknown): boolean {
  if (
    control.kind === 'quota' ||
    control.kind === 'rate_limit' ||
    control.kind === 'numeric_ceiling'
  ) {
    return Number.isSafeInteger(value) &&
      (value as number) >= control.minimum &&
      (value as number) <= control.maximum
  }
  if (control.kind === 'boolean') return typeof value === 'boolean'
  const allowed = new Set(control.options.map((option) => option.value))
  if (control.kind === 'enum_one') return typeof value === 'string' && allowed.has(value)
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) return false
  const selected = value as string[]
  return new Set(selected).size === selected.length && selected.every((item) => allowed.has(item))
}

export function validateUsagePolicyRules(
  capabilities: ActiveCapability[],
  rules: UsagePolicyRule[]
): UsagePolicyValidation {
  const errors: string[] = []
  const capabilityByKey = new Map(capabilities.map((capability) => [capability.key, capability]))
  const seen = new Set<string>()
  const requestedPermissions = new Set<string>()

  for (const rule of rules) {
    const identity = `${rule.permission_key}/${rule.control_key}`
    if (seen.has(identity)) errors.push(`${identity} is duplicated`)
    seen.add(identity)
    requestedPermissions.add(rule.permission_key)

    const capability = capabilityByKey.get(rule.permission_key)
    const control = capability?.usage_controls.find((entry) => entry.key === rule.control_key)
    if (!control) {
      errors.push(`${identity} is not in the active catalog`)
      continue
    }
    if (!validValue(control, rule.value)) errors.push(`${identity} has an invalid value`)
  }

  for (const permissionKey of requestedPermissions) {
    const capability = capabilityByKey.get(permissionKey)
    if (!capability) continue
    for (const control of capability.usage_controls) {
      const identity = `${permissionKey}/${control.key}`
      if (!seen.has(identity)) errors.push(`${identity} is required`)
    }
  }

  if (rules.length === 0) errors.push('At least one complete controlled Permission is required')
  return { valid: errors.length === 0, errors }
}
