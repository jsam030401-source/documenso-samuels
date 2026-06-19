import { Badge } from '@documenso/ui/primitives/badge';
import { Button } from '@documenso/ui/primitives/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@documenso/ui/primitives/card';
import { Bookmark, CalendarDays, CheckCircle2, DollarSign, FileText, MapPin, PenLine, Users } from 'lucide-react';

import { ChecklistCard, type ChecklistCardItem } from './checklist-card';
import { DEFAULT_PORTAL_BRAND, PortalBannerHeader, type PortalBrand } from './portal-banner-header';

type Role = 'APPLICANT' | 'COSIGNER';

type GroupMember = {
  id: string;
  name: string;
  role: Role;
  isStudent: boolean;
  linkedToName: string | null;
};

export type PortalViewData = {
  application: {
    slug: string;
    title: string | null;
    unitAddress: string | null;
    rent: number | null;
    moveInDate: Date | string | null;
    status: string;
  };
  participant: {
    id: string;
    name: string;
    role: Role;
    isStudent: boolean;
  };
  group: GroupMember[];
  checklist: ChecklistCardItem[];
  forms: { token: string; title: string; signed: boolean }[];
  progress: { completed: number; total: number };
};

const roleLabel = (role: Role) => (role === 'APPLICANT' ? 'Applicant' : 'Co-signer');

const formatMoveIn = (value: Date | string | null) => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

export function PortalView({ data, brand = DEFAULT_PORTAL_BRAND }: { data: PortalViewData; brand?: PortalBrand }) {
  const { application, participant, group, checklist, forms, progress } = data;

  const moveIn = formatMoveIn(application.moveInDate);
  const hasDealInfo = Boolean(application.unitAddress || application.rent != null || moveIn);

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <PortalBannerHeader brand={brand} />

      <div className="mx-auto w-full max-w-lg px-4 py-8 sm:py-12">
        <div className="mb-6 text-center">
          <h1 className="font-bold text-2xl tracking-tight">
            {application.title || application.unitAddress || 'Rental Application'}
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">Your application portal</p>
        </div>

        {/* Welcome */}
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>{participant.name}</CardTitle>
            <CardDescription>
              {roleLabel(participant.role)}
              {participant.isStudent && ' (Student)'}
            </CardDescription>
          </CardHeader>
          {!hasDealInfo && (
            <CardContent>
              <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-3">
                <Bookmark className="size-4 shrink-0 text-muted-foreground" />
                <p className="text-muted-foreground text-xs">
                  Bookmark this page &mdash; it&apos;s your one link for everything.
                </p>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Your Group */}
        {group.length > 0 && (
          <Card className="mb-4">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="size-5 text-muted-foreground" />
                <CardTitle className="text-base">Your Group</CardTitle>
              </div>
              <CardDescription>Others who have joined this application so far.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {group.map((member) => {
                const subtitle =
                  member.role === 'COSIGNER'
                    ? member.linkedToName
                      ? `Co-signer for ${member.linkedToName}`
                      : 'Co-signer'
                    : 'Applicant';

                return (
                  <div key={member.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium">{member.name}</span>
                    <span className="text-muted-foreground text-xs">{subtitle}</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Deal info */}
        {hasDealInfo && (
          <Card className="mb-4">
            <CardContent className="space-y-2 py-4">
              {application.unitAddress && (
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="size-4 text-muted-foreground" />
                  <span>{application.unitAddress}</span>
                </div>
              )}
              {application.rent != null && (
                <div className="flex items-center gap-2 text-sm">
                  <DollarSign className="size-4 text-muted-foreground" />
                  <span>${application.rent.toLocaleString()}/month</span>
                </div>
              )}
              {moveIn && (
                <div className="flex items-center gap-2 text-sm">
                  <CalendarDays className="size-4 text-muted-foreground" />
                  <span>Move-in: {moveIn}</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Progress */}
        {progress.total > 0 && (
          <Card className="mb-4">
            <CardContent className="py-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium">
                  {progress.completed} / {progress.total} complete
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${(progress.completed / progress.total) * 100}%` }}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Forms to Sign (Phase 2) */}
        {forms.length > 0 && (
          <div className="mb-6 space-y-3">
            <h2 className="font-semibold text-lg">Forms to Sign</h2>
            {forms.map((form) => (
              <Card key={form.token}>
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                      <FileText className="size-5 text-muted-foreground" />
                    </div>
                    <p className="font-medium text-sm">{form.title}</p>
                  </div>
                  {form.signed ? (
                    <Badge variant="default">
                      <CheckCircle2 className="mr-1 size-3" />
                      Signed
                    </Badge>
                  ) : (
                    <a href={`/sign/${form.token}`}>
                      <Button size="sm">
                        <PenLine className="size-4" />
                        Sign
                      </Button>
                    </a>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Documents to Submit */}
        <div className="space-y-3">
          <h2 className="font-semibold text-lg">Documents to Submit</h2>
          {checklist.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                No documents required yet.
              </CardContent>
            </Card>
          ) : (
            checklist.map((item) => <ChecklistCard key={item.id} item={item} slug={application.slug} />)
          )}
        </div>

        {/* Footer */}
        {(brand.supportEmail || brand.supportPhone) && (
          <div className="mt-8 border-t pt-4 text-center text-muted-foreground text-xs">
            {brand.supportEmail && <span>{brand.supportEmail}</span>}
            {brand.supportEmail && brand.supportPhone && <span> &bull; </span>}
            {brand.supportPhone && <span>{brand.supportPhone}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
