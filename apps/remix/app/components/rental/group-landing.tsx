import { Button } from '@documenso/ui/primitives/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@documenso/ui/primitives/card';
import { Checkbox } from '@documenso/ui/primitives/checkbox';
import { Input } from '@documenso/ui/primitives/input';
import { Label } from '@documenso/ui/primitives/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@documenso/ui/primitives/select';
import { ArrowLeft, Clock, LogIn, PenLine, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import { useFetcher } from 'react-router';

type Role = 'APPLICANT' | 'COSIGNER';
type View = 'choice' | 'join' | 'signin';

type ActionData = { error?: string; notFound?: boolean } | undefined;

export type GroupLandingApplicant = { id: string; name: string };

export function GroupLanding({
  title,
  applicants,
  closed,
}: {
  title: string;
  applicants: GroupLandingApplicant[];
  closed: boolean;
}) {
  const [view, setView] = useState<View>('choice');

  if (closed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>This application is no longer accepting submissions.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {view === 'choice' && <ChoiceView onJoin={() => setView('join')} onSignIn={() => setView('signin')} />}

      {view === 'join' && <JoinView applicants={applicants} onBack={() => setView('choice')} />}

      {view === 'signin' && <SignInView onBack={() => setView('choice')} onSwitchToJoin={() => setView('join')} />}
    </div>
  );
}

function ChoiceView({ onJoin, onSignIn }: { onJoin: () => void; onSignIn: () => void }) {
  return (
    <div className="space-y-3">
      <Card className="cursor-pointer transition-colors hover:bg-muted/50" onClick={onJoin}>
        <CardContent className="flex items-center gap-4 py-5">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <UserPlus className="size-6 text-primary" />
          </div>
          <div>
            <p className="font-semibold">I&apos;m new &mdash; join this application</p>
            <p className="text-muted-foreground text-sm">Sign up as an applicant or co-signer</p>
          </div>
        </CardContent>
      </Card>

      <Card className="cursor-pointer transition-colors hover:bg-muted/50" onClick={onSignIn}>
        <CardContent className="flex items-center gap-4 py-5">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted">
            <LogIn className="size-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold">Already joined? Sign in</p>
            <p className="text-muted-foreground text-sm">Use the email and phone you signed up with</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function JoinView({ applicants, onBack }: { applicants: GroupLandingApplicant[]; onBack: () => void }) {
  const fetcher = useFetcher();
  const data = fetcher.data as ActionData;
  const isPending = fetcher.state !== 'idle';

  const [role, setRole] = useState<Role>('APPLICANT');
  const [isStudent, setIsStudent] = useState(false);
  const [linkedTo, setLinkedTo] = useState('');

  const cosignerNoApplicant = role === 'COSIGNER' && applicants.length === 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" type="button" onClick={onBack}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <CardTitle>Join this application</CardTitle>
            <CardDescription>Enter your information to get started</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <fetcher.Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="join" />
          <input type="hidden" name="role" value={role} />

          {data?.error && <div className="rounded-md bg-destructive/10 p-3 text-destructive text-sm">{data.error}</div>}

          {/* Role selection — tappable cards */}
          <div className="space-y-2">
            <Label>I am a...</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRole('APPLICANT')}
                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-center transition-colors ${
                  role === 'APPLICANT'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/30'
                }`}
              >
                <Users className={`size-6 ${role === 'APPLICANT' ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className={`font-medium text-sm ${role === 'APPLICANT' ? 'text-primary' : ''}`}>Applicant</span>
              </button>
              <button
                type="button"
                onClick={() => setRole('COSIGNER')}
                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-center transition-colors ${
                  role === 'COSIGNER' ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'
                }`}
              >
                <PenLine className={`size-6 ${role === 'COSIGNER' ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className={`font-medium text-sm ${role === 'COSIGNER' ? 'text-primary' : ''}`}>Co-signer</span>
              </button>
            </div>
          </div>

          {role === 'APPLICANT' && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="is_student"
                name="is_student"
                checked={isStudent}
                onCheckedChange={(value) => setIsStudent(value === true)}
              />
              <Label htmlFor="is_student" className="font-normal text-sm">
                I am a student (no income verification required)
              </Label>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="first_name">First name</Label>
              <Input id="first_name" name="first_name" required placeholder="Jane" autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">Last name</Label>
              <Input id="last_name" name="last_name" required placeholder="Doe" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required placeholder="jane@example.com" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" name="phone" type="tel" required placeholder="(555) 123-4567" />
          </div>

          {role === 'COSIGNER' && applicants.length > 0 && (
            <div className="space-y-2">
              <Label>Co-signing for</Label>
              <input type="hidden" name="linked_to" value={linkedTo} />
              <Select value={linkedTo || undefined} onValueChange={(value) => setLinkedTo(value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select an applicant" />
                </SelectTrigger>
                <SelectContent>
                  {applicants.map((applicant) => (
                    <SelectItem key={applicant.id} value={applicant.id}>
                      {applicant.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                Don&apos;t see them? Wait until they create their account, then come back.
              </p>
            </div>
          )}

          {cosignerNoApplicant ? (
            <div className="flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900/50 dark:bg-amber-950/30">
              <Clock className="size-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="space-y-1">
                <p className="font-medium text-amber-900 dark:text-amber-200">Hold tight</p>
                <p className="text-amber-800 dark:text-amber-300/90">
                  Wait until the applicant you&apos;re co-signing for creates their account, then come back to join.
                </p>
              </div>
            </div>
          ) : (
            <Button type="submit" className="w-full" loading={isPending}>
              {isPending ? 'Joining...' : 'Join application'}
            </Button>
          )}
        </fetcher.Form>
      </CardContent>
    </Card>
  );
}

function SignInView({ onBack, onSwitchToJoin }: { onBack: () => void; onSwitchToJoin: () => void }) {
  const fetcher = useFetcher();
  const data = fetcher.data as ActionData;
  const isPending = fetcher.state !== 'idle';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" type="button" onClick={onBack}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Enter the email and phone you used when you first joined</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <fetcher.Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="signin" />

          {data?.notFound && (
            <div className="space-y-3 rounded-md border bg-muted/50 p-4">
              <p className="text-sm">
                We couldn&apos;t find you in this application. Double-check your email and phone, or join as a new
                participant.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={onSwitchToJoin}>
                <UserPlus className="size-4" />
                Join instead
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="signin-email">Email</Label>
            <Input id="signin-email" name="email" type="email" required placeholder="jane@example.com" autoFocus />
          </div>

          <div className="space-y-2">
            <Label htmlFor="signin-phone">Phone</Label>
            <Input id="signin-phone" name="phone" type="tel" required placeholder="(555) 123-4567" />
          </div>

          <Button type="submit" className="w-full" loading={isPending}>
            {isPending ? 'Signing in...' : 'Sign in'}
          </Button>
        </fetcher.Form>
      </CardContent>
    </Card>
  );
}
