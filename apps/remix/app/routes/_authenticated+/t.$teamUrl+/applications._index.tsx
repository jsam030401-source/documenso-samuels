import { trpc } from '@documenso/trpc/react';
import { cn } from '@documenso/ui/lib/utils';
import { Button } from '@documenso/ui/primitives/button';
import { Calendar } from '@documenso/ui/primitives/calendar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@documenso/ui/primitives/card';
import { Input } from '@documenso/ui/primitives/input';
import { Label } from '@documenso/ui/primitives/label';
import { Popover, PopoverContent, PopoverTrigger } from '@documenso/ui/primitives/popover';
import { useToast } from '@documenso/ui/primitives/use-toast';
import { CalendarIcon } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';

export function meta() {
  return [{ title: 'Rental Applications' }];
}

export default function ApplicationsPage() {
  const { toast } = useToast();
  const params = useParams();
  const teamUrl = params.teamUrl ?? '';

  const { data: applications = [], isLoading, refetch } = trpc.application.getApplications.useQuery();

  const { mutateAsync: createApplication, isPending } = trpc.application.createApplication.useMutation();

  const [title, setTitle] = useState('');
  const [street, setStreet] = useState('');
  const [unitNumber, setUnitNumber] = useState('');
  const [city, setCity] = useState('');
  const [rent, setRent] = useState('');
  const [moveInDate, setMoveInDate] = useState<Date | undefined>(undefined);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const onCreate = async (event: React.FormEvent) => {
    event.preventDefault();

    try {
      await createApplication({
        title: title.trim() || undefined,
        street: street.trim() || undefined,
        unitNumber: unitNumber.trim() || undefined,
        city: city.trim() || undefined,
        rent: rent ? Number(rent) : undefined,
        moveInDate: moveInDate ? moveInDate.toISOString() : undefined,
      });

      setTitle('');
      setStreet('');
      setUnitNumber('');
      setCity('');
      setRent('');
      setMoveInDate(undefined);

      await refetch();

      toast({ title: 'Application created', description: 'Share the link with applicants.' });
    } catch {
      toast({
        title: 'Could not create application',
        description: 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const copyLink = async (slug: string) => {
    await navigator.clipboard.writeText(`${origin}/a/${slug}`);
    toast({ title: 'Link copied' });
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="font-semibold text-2xl">Rental Applications</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Create an application and share its link with applicants and co-signers.
        </p>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base">New application</CardTitle>
          <CardDescription>A new shareable link is generated for each application.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="123 Main St — Unit 2"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="street">Street address</Label>
              <Input
                id="street"
                value={street}
                onChange={(event) => setStreet(event.target.value)}
                placeholder="123 Main St"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="unitNumber">Unit #</Label>
                <Input
                  id="unitNumber"
                  value={unitNumber}
                  onChange={(event) => setUnitNumber(event.target.value)}
                  placeholder="2"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input id="city" value={city} onChange={(event) => setCity(event.target.value)} placeholder="Boston" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="rent">Monthly rent</Label>
                <Input
                  id="rent"
                  type="number"
                  min="0"
                  step="50"
                  value={rent}
                  onChange={(event) => setRent(event.target.value)}
                  placeholder="2500"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="moveInDate">Move-in date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="moveInDate"
                      type="button"
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !moveInDate && 'text-muted-foreground',
                      )}
                    >
                      <CalendarIcon className="mr-2 size-4" />
                      {moveInDate
                        ? moveInDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                        : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={moveInDate}
                      onSelect={setMoveInDate}
                      defaultMonth={moveInDate}
                      captionLayout="dropdown-buttons"
                      fromYear={new Date().getFullYear() - 1}
                      toYear={new Date().getFullYear() + 6}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <Button type="submit" loading={isPending}>
              Create application
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="font-semibold text-lg">Your applications</h2>

        {isLoading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : applications.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              No applications yet. Create one above to get a shareable link.
            </CardContent>
          </Card>
        ) : (
          applications.map((application) => (
            <Card key={application.id}>
              <CardContent className="space-y-3 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link to={`/t/${teamUrl}/applications/${application.id}`} className="font-medium hover:underline">
                      {application.title || application.unitAddress || 'Untitled application'}
                    </Link>
                    <p className="text-muted-foreground text-xs">
                      {application.status} · {application.participantCount} participant
                      {application.participantCount === 1 ? '' : 's'}
                    </p>
                  </div>
                  <Link to={`/t/${teamUrl}/applications/${application.id}`}>
                    <Button type="button" variant="outline" size="sm">
                      Manage
                    </Button>
                  </Link>
                </div>

                <div className="flex items-center gap-2">
                  <Input readOnly value={`${origin}/a/${application.slug}`} className="text-xs" />
                  <Button type="button" variant="outline" size="sm" onClick={() => copyLink(application.slug)}>
                    Copy
                  </Button>
                  <a href={`/a/${application.slug}`} target="_blank" rel="noopener noreferrer">
                    <Button type="button" variant="outline" size="sm">
                      Open
                    </Button>
                  </a>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
