import type { Prisma } from '@prisma/client';

import type { TFieldMetaPrefillFieldsSchema } from '../../types/field-meta';

/**
 * The deal-terms subset of a RentalApplication used to fill signing forms, plus
 * the participant names (for the auto-derived co-tenant fields).
 */
export type PrefillContext = {
  application: {
    street: string | null;
    unitNumber: string | null;
    city: string | null;
    rent: Prisma.Decimal | null;
    moveInDate: Date | null;
    leaseTermMonths: number | null;
    leaseStartDate: Date | null;
    leaseEndDate: Date | null;
    petsAllowed: boolean | null;
    lastMonthRent: Prisma.Decimal | null;
    securityDeposit: Prisma.Decimal | null;
    brokerFee: Prisma.Decimal | null;
    lockChangeFee: Prisma.Decimal | null;
    applicationFee: Prisma.Decimal | null;
    todaysDeposit: Prisma.Decimal | null;
    balanceDue: Prisma.Decimal | null;
  };
  participantNames: string[];
};

type TemplateTextField = { id: number; fieldMeta: Prisma.JsonValue };

const normalizeLabel = (label: string | null | undefined) => (label ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const fmtMoney = (value: Prisma.Decimal | null) =>
  value === null ? undefined : Number(value).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const fmtDate = (value: Date | null) =>
  value === null ? undefined : value.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

/**
 * Map normalized template field labels to their value. Several aliases point to
 * the same value so the broker has some leeway in how they name the fields.
 */
const buildMergeValues = ({
  application: a,
  participantNames,
}: PrefillContext): Record<string, string | undefined> => ({
  streetaddress: a.street ?? undefined,
  street: a.street ?? undefined,
  address: a.street ?? undefined,
  unitnumber: a.unitNumber ?? undefined,
  unit: a.unitNumber ?? undefined,
  city: a.city ?? undefined,
  monthlyrent: fmtMoney(a.rent),
  rent: fmtMoney(a.rent),
  firstmonthrent: fmtMoney(a.rent),
  leaseterm: a.leaseTermMonths?.toString(),
  leasetermmonths: a.leaseTermMonths?.toString(),
  term: a.leaseTermMonths?.toString(),
  leasestartdate: fmtDate(a.leaseStartDate),
  leasestart: fmtDate(a.leaseStartDate),
  leaseenddate: fmtDate(a.leaseEndDate),
  leaseend: fmtDate(a.leaseEndDate),
  moveindate: fmtDate(a.moveInDate),
  pets: a.petsAllowed === null ? undefined : a.petsAllowed ? 'Yes' : 'No',
  lastmonthrent: fmtMoney(a.lastMonthRent),
  securitydeposit: fmtMoney(a.securityDeposit),
  brokerfee: fmtMoney(a.brokerFee),
  lockchangefee: fmtMoney(a.lockChangeFee),
  applicationfee: fmtMoney(a.applicationFee),
  todaysdeposit: fmtMoney(a.todaysDeposit),
  balancedue: fmtMoney(a.balanceDue),
  numberoftenants: participantNames.length ? String(participantNames.length) : undefined,
  totaltenants: participantNames.length ? String(participantNames.length) : undefined,
  cotenants: participantNames.length ? participantNames.join(', ') : undefined,
  cotenantnames: participantNames.length ? participantNames.join(', ') : undefined,
});

/**
 * Build `prefillFields` for `createDocumentFromTemplate` by matching each TEXT
 * template field's label against the deal terms. Only fields with a recognized
 * label and a present value are filled; everything else is left for the signer.
 */
export const buildPrefillFields = (
  templateTextFields: TemplateTextField[],
  context: PrefillContext,
): TFieldMetaPrefillFieldsSchema[] => {
  const values = buildMergeValues(context);

  return templateTextFields
    .map((field) => {
      const label = normalizeLabel((field.fieldMeta as { label?: string } | null)?.label);
      const value = label ? values[label] : undefined;

      if (value === undefined) {
        return null;
      }

      return { id: field.id, type: 'text' as const, value };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
};
