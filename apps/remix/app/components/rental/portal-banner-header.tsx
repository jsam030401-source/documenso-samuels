export type PortalBrand = {
  companyName: string;
  logoUrl?: string | null;
  supportEmail?: string | null;
  supportPhone?: string | null;
};

/**
 * Single-brand banner for v1 (logo OR company name on the theme primary colour).
 * Multi-tenant branding, if ever needed, can later ride on Documenso Teams.
 */
export const DEFAULT_PORTAL_BRAND: PortalBrand = {
  companyName: 'Samuels Systems',
  logoUrl: null,
  supportEmail: null,
  supportPhone: null,
};

export function PortalBannerHeader({ brand = DEFAULT_PORTAL_BRAND }: { brand?: PortalBrand }) {
  return (
    <div className="flex h-40 w-full items-center justify-center bg-primary">
      {brand.logoUrl ? (
        <img src={brand.logoUrl} alt={brand.companyName} className="max-h-[100px] max-w-[400px] object-contain" />
      ) : (
        <span className="font-bold text-4xl text-primary-foreground">{brand.companyName}</span>
      )}
    </div>
  );
}
