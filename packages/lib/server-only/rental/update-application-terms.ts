import { prisma } from '@documenso/prisma';

import { AppError, AppErrorCode } from '../../errors/app-error';

export type UpdateApplicationTermsOptions = {
  teamId: number;
  applicationId: string;
  data: {
    title?: string | null;
    street?: string | null;
    unitNumber?: string | null;
    city?: string | null;
    rent?: number | null;
    moveInDate?: string | null;
    leaseTermMonths?: number | null;
    leaseStartDate?: string | null;
    leaseEndDate?: string | null;
    petsAllowed?: boolean | null;
    lastMonthRent?: number | null;
    securityDeposit?: number | null;
    brokerFee?: number | null;
    lockChangeFee?: number | null;
    applicationFee?: number | null;
    todaysDeposit?: number | null;
    balanceDue?: number | null;
  };
};

// undefined => leave column unchanged; null => clear; value => set.
const toDate = (value?: string | null) => (value === undefined ? undefined : value === null ? null : new Date(value));

/**
 * Save the broker-entered deal terms on an application, scoped to the team.
 * These flow into the generated signing forms via the prefill engine.
 */
export const updateApplicationTerms = async ({ teamId, applicationId, data }: UpdateApplicationTermsOptions) => {
  const application = await prisma.rentalApplication.findFirst({
    where: { id: applicationId, teamId },
    select: { id: true },
  });

  if (!application) {
    throw new AppError(AppErrorCode.NOT_FOUND, { message: 'Application not found' });
  }

  return await prisma.rentalApplication.update({
    where: { id: application.id },
    data: {
      title: data.title,
      street: data.street,
      unitNumber: data.unitNumber,
      city: data.city,
      rent: data.rent,
      moveInDate: toDate(data.moveInDate),
      leaseTermMonths: data.leaseTermMonths,
      leaseStartDate: toDate(data.leaseStartDate),
      leaseEndDate: toDate(data.leaseEndDate),
      petsAllowed: data.petsAllowed,
      lastMonthRent: data.lastMonthRent,
      securityDeposit: data.securityDeposit,
      brokerFee: data.brokerFee,
      lockChangeFee: data.lockChangeFee,
      applicationFee: data.applicationFee,
      todaysDeposit: data.todaysDeposit,
      balanceDue: data.balanceDue,
    },
    select: { id: true },
  });
};
