import type { ApiRequestMetadata } from '../../universal/extract-request-metadata';

/**
 * Synthetic request metadata for rental-application provisioning that happens
 * outside an authenticated HTTP request (e.g. the public portal loader, which
 * lazily creates signing envelopes on behalf of `RentalApplication.ownerUserId`).
 *
 * The Documenso services that record audit logs (`createDocumentFromTemplate`,
 * `sendDocument`) require an `ApiRequestMetadata`; there is no signed-in user on
 * that path, so we mark the source as the app with no auth. Provisioning that
 * runs from an authenticated tRPC mutation should pass `ctx.metadata` instead.
 */
export const internalRentalRequestMetadata = (): ApiRequestMetadata => ({
  source: 'app',
  auth: null,
  requestMetadata: {},
});
