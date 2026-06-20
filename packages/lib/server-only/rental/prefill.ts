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

/** Formatted value for each deal-term key (undefined = nothing entered yet). */
const termValues = ({ application: a, participantNames }: PrefillContext): Record<DealTermKey, string | undefined> => ({
  street: a.street ?? undefined,
  unitNumber: a.unitNumber ?? undefined,
  city: a.city ?? undefined,
  rent: fmtMoney(a.rent),
  firstMonthRent: fmtMoney(a.firstMonthRent),
  leaseTermMonths: a.leaseTermMonths?.toString(),
  leaseStartDate: fmtDate(a.leaseStartDate),
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
  leasestartdate: 'leaseStartDate',
  leasestart: 'leaseStartDate',
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
