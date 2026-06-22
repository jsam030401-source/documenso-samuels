import type { Prisma } from '@prisma/client';

import type { TFieldMetaPrefillFieldsSchema } from '../../types/field-meta';
import type { DealTermKey } from '../../types/rental-deal-terms';

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
    firstMonthRent: Prisma.Decimal | null;
    moveInDate: Date | null;
    leaseTermMonths: number | null;
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

/**
 * US date format (month/day/year) forced onto rental signing envelopes so Documenso's
 * native DATE fields render `MM/DD/YYYY` instead of the day-first default. Matches the
 * `MM/dd/yyyy` value our prefilled TEXT dates use.
 */
export const RENTAL_DOCUMENT_DATE_FORMAT = 'MM/dd/yyyy';

// Whole dollars — rental amounts don't need cents (e.g. "$1,500", not "$1,500.00").
const fmtMoney = (value: Prisma.Decimal | null) =>
  value === null
    ? undefined
    : Number(value).toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });

// Compact MM/DD/YYYY: the long "Month D, YYYY" form overflowed the broker's
// narrow date fields and clipped the year off. This always fits and shows the year.
const fmtDate = (value: Date | null) => {
  if (value === null) {
    return undefined;
  }

  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');

  return `${month}/${day}/${value.getFullYear()}`;
};

/** Formatted value for each deal-term key (undefined = nothing entered yet). */
const termValues = ({ application: a, participantNames }: PrefillContext): Record<DealTermKey, string | undefined> => ({
  street: a.street ?? undefined,
  unitNumber: a.unitNumber ?? undefined,
  city: a.city ?? undefined,
  rent: fmtMoney(a.rent),
  firstMonthRent: fmtMoney(a.firstMonthRent),
  leaseTermMonths: a.leaseTermMonths?.toString(),
  leaseEndDate: fmtDate(a.leaseEndDate),
  moveInDate: fmtDate(a.moveInDate),
  petsAllowed: a.petsAllowed === null ? undefined : a.petsAllowed ? 'Yes' : 'No',
  lastMonthRent: fmtMoney(a.lastMonthRent),
  securityDeposit: fmtMoney(a.securityDeposit),
  brokerFee: fmtMoney(a.brokerFee),
  lockChangeFee: fmtMoney(a.lockChangeFee),
  applicationFee: fmtMoney(a.applicationFee),
  todaysDeposit: fmtMoney(a.todaysDeposit),
  balanceDue: fmtMoney(a.balanceDue),
  tenantCount: participantNames.length ? String(participantNames.length) : undefined,
  coTenants: participantNames.length ? participantNames.join(', ') : undefined,
});

/** Fallback auto-match: normalized field label -> term key (used when unmapped). */
const LABEL_ALIASES: Record<string, DealTermKey> = {
  streetaddress: 'street',
  street: 'street',
  address: 'street',
  unitnumber: 'unitNumber',
  unit: 'unitNumber',
  city: 'city',
  monthlyrent: 'rent',
  rent: 'rent',
  firstmonthrent: 'firstMonthRent',
  leaseterm: 'leaseTermMonths',
  leasetermmonths: 'leaseTermMonths',
  term: 'leaseTermMonths',
  months: 'leaseTermMonths',
  // Move-in date doubles as the lease start, so "lease start" labels resolve to it.
  leasestartdate: 'moveInDate',
  leasestart: 'moveInDate',
  leaseenddate: 'leaseEndDate',
  leaseend: 'leaseEndDate',
  moveindate: 'moveInDate',
  pets: 'petsAllowed',
  lastmonthrent: 'lastMonthRent',
  securitydeposit: 'securityDeposit',
  brokerfee: 'brokerFee',
  lockchangefee: 'lockChangeFee',
  applicationfee: 'applicationFee',
  todaysdeposit: 'todaysDeposit',
  balancedue: 'balanceDue',
  numberoftenants: 'tenantCount',
  totaltenants: 'tenantCount',
  cotenants: 'coTenants',
  cotenantnames: 'coTenants',
};

/**
 * Build `prefillFields` for `createDocumentFromTemplate`. For each TEXT field,
 * the term is resolved by the explicit per-template mapping first, then by a
 * label auto-match fallback. Only fields that resolve to a term with a present
 * value get filled; the rest are left for the signer.
 */
export const buildPrefillFields = (
  templateTextFields: TemplateTextField[],
  context: PrefillContext,
  mapping: Map<number, DealTermKey> = new Map(),
): TFieldMetaPrefillFieldsSchema[] => {
  const values = termValues(context);

  return templateTextFields
    .map((field) => {
      const key =
        mapping.get(field.id) ?? LABEL_ALIASES[normalizeLabel((field.fieldMeta as { label?: string } | null)?.label)];
      const value = key ? values[key] : undefined;

      if (value === undefined) {
        return null;
      }

      return { id: field.id, type: 'text' as const, value };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
};
