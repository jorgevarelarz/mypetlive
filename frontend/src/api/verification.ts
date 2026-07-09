import { api as axios } from '../api/client';

export type VerificationDocumentType =
  | 'nif'
  | 'association_registry'
  | 'animal_protection_registry'
  | 'zoological_center'
  | 'other';

export type VerificationDocument = {
  type: VerificationDocumentType;
  fileUrl: string;
  status?: 'pending' | 'approved' | 'rejected';
};

export type VerificationRecord = {
  status: 'unverified' | 'pending' | 'verified' | 'rejected';
  verificationLevel?: 'none' | 'association' | 'animal_protection_entity' | 'authorized_center';
  legalName?: string;
  nif?: string;
  associationRegistryNumber?: string;
  animalProtectionRegistryNumber?: string;
  zoologicalCenterNumber?: string;
  autonomousCommunity?: string;
  representativeName?: string;
  representativeRole?: string;
  documents?: VerificationDocument[];
  notes?: string;
  updatedAt?: string;
};

export const getMyVerification = async (userId: string) => {
  const res = await axios.get(`/api/verification/me`, {
    headers: { 'x-user-id': userId },
  });
  return res.data as VerificationRecord;
};

export const submitVerification = async (
  userId: string,
  payload: Omit<VerificationRecord, 'status' | 'verificationLevel' | 'notes' | 'updatedAt'>,
) => {
  const res = await axios.post(`/api/verification/submit`, payload, {
    headers: { 'x-user-id': userId },
  });
  return res.data as VerificationRecord;
};

export const devVerifyMe = async (userId: string) => {
  const res = await axios.post(
    `/api/verification/dev/verify`,
    {},
    { headers: { 'x-user-id': userId } }
  );
  return res.data;
};
