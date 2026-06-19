'use client';

import { ArrowLeft, Clock, LogIn, PenLine, UserPlus, Users } from 'lucide-react';
import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { type JoinFormState, joinDeal, type SignInFormState, signInToDeal } from './join/actions';

type View = 'choice' | 'join' | 'signin';

export function GroupLanding({
  slug,
  dealName,
  defaultRole,
  applicants,
}: {
  slug: string;
  dealName: string;
  defaultRole: 'applicant' | 'cosigner';
  applicants: Array<{ id: string; people: { name: string } | null }>;
}) {
  const [view, setView] = useState<View>('choice');

  return (
    <div className="space-y-4">
      {view === 'choice' && (
        <ChoiceView dealName={dealName} onJoin={() => setView('join')} onSignIn={() => setView('signin')} />
      )}

      {view === 'join' && (
        <JoinView slug={slug} defaultRole={defaultRole} applicants={applicants} onBack={() => setView('choice')} />
      )}

      {view === 'signin' && (
        <SignInView slug={slug} onBack={() => setView('choice')} onSwitchToJoin={() => setView('join')} />
      )}
    </div>
  );
}

function ChoiceView({ dealName, onJoin, onSignIn }: { dealName: string; onJoin: () => void; onSignIn: () => void }) {
  return (
    <div className="space-y-3">
      <Card className="cursor-pointer transition-colors hover:bg-muted/50" onClick={onJoin}>
        <CardContent className="flex items-center gap-4 py-5">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <UserPlus className="size-6 text-primary" />
          </div>
          <div>
            <p className="font-semibold">I&apos;m new &mdash; join this deal</p>
            <p className="text-muted-foreground text-sm">Sign up as an Applicant or Co-signer</p>
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

function JoinView({
  slug,
  defaultRole,
  applicants,
  onBack,
}: {
  slug: string;
  defaultRole: 'applicant' | 'cosigner';
  applicants: Array<{ id: string; people: { name: string } | null }>;
  onBack: () => void;
}) {
  const [role, setRole] = useState<'applicant' | 'cosigner'>(defaultRole);
  const [isStudent, setIsStudent] = useState(false);
  const [linkedTo, setLinkedTo] = useState('');

  const boundJoinDeal = joinDeal.bind(null, slug);
  const [state, formAction, isPending] = useActionState<JoinFormState, FormData>(boundJoinDeal, {});

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-xs" onClick={onBack}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <CardTitle>Join this deal</CardTitle>
            <CardDescription>Enter your information to get started</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {state.error && (
            <div className="rounded-md bg-destructive/10 p-3 text-destructive text-sm">{state.error}</div>
          )}

          {/* Role selection — tappable cards */}
          <div className="space-y-2">
            <Label>I am a...</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRole('applicant')}
                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-center transition-colors ${
                  role === 'applicant'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/30'
                }`}
              >
                <Users className={`size-6 ${role === 'applicant' ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className={`font-medium text-sm ${role === 'applicant' ? 'text-primary' : ''}`}>Applicant</span>
              </button>
              <button
                type="button"
                onClick={() => setRole('cosigner')}
                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-center transition-colors ${
                  role === 'cosigner' ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'
                }`}
              >
                <PenLine className={`size-6 ${role === 'cosigner' ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className={`font-medium text-sm ${role === 'cosigner' ? 'text-primary' : ''}`}>Co-signer</span>
              </button>
            </div>
            <input type="hidden" name="role" value={role} />
          </div>

          {role === 'applicant' && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="is_student"
                name="is_student"
                checked={isStudent}
                onCheckedChange={(v) => setIsStudent(v === true)}
              />
              <Label htmlFor="is_student" className="font-normal text-sm">
                I am a Student (no income verification required)
              </Label>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="first_name">First Name</Label>
              <Input id="first_name" name="first_name" required placeholder="Jane" autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">Last Name</Label>
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

          {role === 'cosigner' && applicants.length > 0 && (
            <div className="space-y-2">
              <Label>Co-signing for</Label>
              <input type="hidden" name="linked_to" value={linkedTo} required />
              <Select value={linkedTo || null} onValueChange={(v) => setLinkedTo(v ?? '')}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select an Applicant">
                    {linkedTo ? (applicants.find((a) => a.id === linkedTo)?.people?.name ?? 'Unknown') : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {applicants.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.people?.name ?? 'Unknown'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                Don&apos;t see them? Wait until they create their account, then come back.
              </p>
            </div>
          )}

          {role === 'cosigner' && applicants.length === 0 ? (
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
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? 'Joining...' : 'Join Deal'}
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

function SignInView({
  slug,
  onBack,
  onSwitchToJoin,
}: {
  slug: string;
  onBack: () => void;
  onSwitchToJoin: () => void;
}) {
  const boundSignIn = signInToDeal.bind(null, slug);
  const [state, formAction, isPending] = useActionState<SignInFormState, FormData>(boundSignIn, {});

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-xs" onClick={onBack}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Enter the email and phone you used when you first joined</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {state.error && (
            <div className="rounded-md bg-destructive/10 p-3 text-destructive text-sm">{state.error}</div>
          )}

          {state.notFound && (
            <div className="space-y-3 rounded-md border bg-muted/50 p-4">
              <p className="text-sm">
                We couldn&apos;t find you in this deal. Double-check your email and phone, or join as a new participant.
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

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
