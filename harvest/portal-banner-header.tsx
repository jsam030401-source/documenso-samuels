'use client';

import type { Brand } from '@/lib/branding/context';

const DEFAULT_PADS_LOGO = '/branding/default-pads-logo.svg';

export function PortalBannerHeader({ brand }: { brand: Brand }) {
  return (
    <div className="flex h-40 w-full items-center justify-center" style={{ backgroundColor: 'var(--primary)' }}>
      {brand.logoUrl ? (
        <img src={brand.logoUrl} alt={brand.companyName} className="max-h-[100px] max-w-[400px] object-contain" />
      ) : brand.companyName !== 'PADS' ? (
        <span className="font-bold text-4xl" style={{ color: 'var(--primary-foreground)' }}>
          {brand.companyName}
        </span>
      ) : (
        <div className="flex flex-col items-center" style={{ color: 'var(--primary-foreground)' }}>
          <span className="font-bold text-4xl">PADS</span>
          <span className="mt-1 text-xs tracking-wide opacity-80">Portal, Applications, Documents and Signing</span>
        </div>
      )}
    </div>
  );
}
