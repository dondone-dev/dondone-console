import { Settings as SettingsIcon } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'

export function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Console deployment and bootstrap configuration." />
      <EmptyState
        icon={<SettingsIcon />}
        title="Managed via Cloudflare"
        description="Bootstrap and deployment settings are managed with Cloudflare environment variables."
      />
    </>
  )
}
