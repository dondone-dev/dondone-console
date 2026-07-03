import { KeyRound, LogIn } from 'lucide-react'
import { startLogin } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export function SignInPage() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <div className="grid w-full max-w-sm gap-6">
        <div className="flex items-center justify-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs">
            <KeyRound className="size-4.5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Dondone Console</span>
        </div>
        <Card>
          <CardHeader className="text-center">
            <CardTitle>Welcome back</CardTitle>
            <CardDescription>
              Sign in with Dondone Auth to manage users and service permissions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => void startLogin()}>
              <LogIn />
              Sign in with Dondone Auth
            </Button>
          </CardContent>
        </Card>
        <p className="text-center text-xs text-muted-foreground">
          Access is restricted to Console administrators.
        </p>
      </div>
    </div>
  )
}
