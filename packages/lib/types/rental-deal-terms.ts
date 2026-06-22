/**
 * The deal-term "merge fields" a broker can map a template text field to. Single
 * source of truth shared by the prefill engine, the tRPC validation, and the
 * mapping UI. Pure constants (no server deps) so it is safe to import anywhere.
 */
export const DEAL_TERM_FIELDS = [
  { key: 'street', label: 'Street address' },
  { key: 'unitNumber', label: 'Unit #' },
  { key: 'city', label: 'City' },
  { key: 'rent', label: 'Monthly rent' },
  { key: 'firstMonthRent', label: 'First month’s rent' },
  { key: 'leaseTermMonths', label: 'Lease term (months)' },
  { key: 'leaseEndDate', label: 'Lease end date' },
  { key: 'moveInDate', label: 'Move-in date' },
  { key: 'petsAllowed', label: 'Pets (Yes / No)' },
  { key: 'lastMonthRent', label: 'Last month’s rent' },
  { key: 'securityDeposit', label: 'Security deposit' },
  { key: 'brokerFee', label: 'Broker fee' },
  { key: 'lockChangeFee', label: 'Lock-change fee' },
  { key: 'applicationFee', label: 'Application fee' },
  { key: 'todaysDeposit', label: 'Today’s deposit' },
  { key: 'balanceDue', label: 'Balance due' },
  { key: 'tenantCount', label: 'Number of tenants' },
  { key: 'coTenants', label: 'Co-tenant names' },
] as const;

export type DealTermKey = (typeof DEAL_TERM_FIELDS)[number]['key'];

export const DEAL_TERM_KEYS = DEAL_TERM_FIELDS.map((field) => field.key) as [DealTermKey, ...DealTermKey[]];

export const DEAL_TERM_LABELS: Record<DealTermKey, string> = Object.fromEntries(
  DEAL_TERM_FIELDS.map((field) => [field.key, field.label]),
) as Record<DealTermKey, string>;
