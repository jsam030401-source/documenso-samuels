export type AddressParts = {
  street?: string | null;
  unitNumber?: string | null;
  city?: string | null;
  /** Deprecated single-line address, used as a fallback for pre-split rows. */
  unitAddress?: string | null;
};

/**
 * Compose the split address (street / unit / city) into a single display line,
 * falling back to the legacy `unitAddress` column for rows that predate the
 * split. Returned by the server fns as `unitAddress` so existing UI keeps working.
 */
export const composeAddress = ({ street, unitNumber, city, unitAddress }: AddressParts): string | null => {
  const streetLine = [street, unitNumber ? `Unit ${unitNumber}` : null].filter(Boolean).join(' ');
  const composed = [streetLine || null, city].filter(Boolean).join(', ');

  return composed || unitAddress || null;
};
