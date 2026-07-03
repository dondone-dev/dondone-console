import { ScrollText } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/empty-state'

export function ActivityPage() {
  return (
    <>
      <PageHeader title="Activity" description="Audit trail of permission and service changes." />
      <EmptyState
        icon={<ScrollText />}
        title="No activity yet"
        description="Audit events will appear here after the audit log table is added."
      />
    </>
  )
}
