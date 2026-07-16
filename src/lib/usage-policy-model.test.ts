import { describe, expect, it } from 'vitest'
import type { ActiveCapability, UsagePolicyRule } from './api'
import { validateUsagePolicyRules } from './usage-policy-model'

const capabilities: ActiveCapability[] = [
  {
    service_key: 'api',
    key: 'api:echo',
    name: 'Echo',
    description: 'Echo',
    oauth_scope: true,
    catalog_version: 'v2',
    usage_controls: [
      {
        key: 'daily_calls',
        name: 'Daily calls',
        kind: 'quota',
        unit: 'call',
        window: 'calendar_day',
        minimum: 0,
        maximum: 1000,
      },
      {
        key: 'request_rate',
        name: 'Request rate',
        kind: 'rate_limit',
        unit: 'request',
        window_seconds: 60,
        minimum: 0,
        maximum: 300,
      },
    ],
  },
]

describe('validateUsagePolicyRules', () => {
  it('accepts one complete rule set for a controlled Permission', () => {
    const rules: UsagePolicyRule[] = [
      { permission_key: 'api:echo', control_key: 'daily_calls', value: 10 },
      { permission_key: 'api:echo', control_key: 'request_rate', value: 30 },
    ]

    expect(validateUsagePolicyRules(capabilities, rules)).toEqual({ valid: true, errors: [] })
  })

  it('rejects a missing control rule', () => {
    const result = validateUsagePolicyRules(capabilities, [
      { permission_key: 'api:echo', control_key: 'daily_calls', value: 10 },
    ])

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('api:echo/request_rate is required')
  })

  it('rejects duplicate, unknown, and out-of-range rules', () => {
    const result = validateUsagePolicyRules(capabilities, [
      { permission_key: 'api:echo', control_key: 'daily_calls', value: 1001 },
      { permission_key: 'api:echo', control_key: 'daily_calls', value: 10 },
      { permission_key: 'api:echo', control_key: 'missing', value: 1 },
    ])

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      'api:echo/daily_calls is duplicated',
      'api:echo/daily_calls has an invalid value',
      'api:echo/missing is not in the active catalog',
      'api:echo/request_rate is required',
    ]))
  })
})
