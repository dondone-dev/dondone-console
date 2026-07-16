import { useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, ShieldAlert } from 'lucide-react'
import { clearSession, loadSession, type Session } from '@/lib/auth'
import { ApiClientError, apiFetch, type MeResponse } from '@/lib/api'
import { ConsoleLayout } from '@/layouts/console-layout'
import { SignInPage } from '@/pages/sign-in'
import { CallbackPage } from '@/pages/callback'
import { UsersPage } from '@/pages/users'
import { UserDetailPage } from '@/pages/user-detail'
import { ServicesPage } from '@/pages/services'
import { ActivityPage } from '@/pages/activity'
import { SettingsPage } from '@/pages/settings'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default function App() {
  const [session, setSession] = useState<Session | null>(() => loadSession())
  const signOut = () => {
    clearSession()
    setSession(null)
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth/callback" element={<CallbackPage />} />
        {session ? (
          <Route element={<ConsoleGate session={session} signOut={signOut} />}>
            <Route index element={<Navigate to="/users" replace />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/users/:userId" element={<UserDetailPage />} />
            <Route path="/services" element={<ServicesPage />} />
            <Route path="/activity" element={<ActivityPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/users" replace />} />
          </Route>
        ) : (
          <Route path="*" element={<SignInPage />} />
        )}
      </Routes>
    </BrowserRouter>
  )
}

function ConsoleGate({ session, signOut }: { session: Session; signOut: () => void }) {
  const me = useQuery({
    queryKey: ['me', session.accessToken],
    queryFn: () => apiFetch<MeResponse>(session, '/api/me'),
    retry: false,
  })

  if (me.isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center gap-2 text-sm text-muted-foreground">
        <RefreshCw className="size-4 animate-spin" />
        Loading console
      </div>
    )
  }

  if (me.isError) {
    const error = me.error
    const isExpired = error instanceof ApiClientError && error.status === 401
    return (
      <CenteredState
        title={isExpired ? 'Session expired' : 'Console setup error'}
        description={
          isExpired
            ? 'Sign in again to continue.'
            : `The Console API could not load your account. Check SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY, and SQL migration status. (${error instanceof Error ? error.message : 'unknown_error'})`
        }
        action={<Button onClick={signOut}>Sign out</Button>}
      />
    )
  }

  if (!me.data?.console_admin) {
    return (
      <CenteredState
        title="Access required"
        description="This account is not a Console administrator."
        action={
          <div className="flex gap-2">
            <Button variant="outline" disabled>
              Initialize admin access
            </Button>
            <Button variant="ghost" onClick={signOut}>
              Sign out
            </Button>
          </div>
        }
      />
    )
  }

  return <ConsoleLayout session={session} me={me.data} signOut={signOut} />
}

function CenteredState(props: {
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-1 flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <ShieldAlert className="size-5" />
          </div>
          <CardTitle>{props.title}</CardTitle>
          <CardDescription>{props.description}</CardDescription>
        </CardHeader>
        {props.action && <CardContent>{props.action}</CardContent>}
      </Card>
    </div>
  )
}
