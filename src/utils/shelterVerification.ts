import { Verification } from '../models/verification.model';

const donationLevels = new Set(['animal_protection_entity', 'authorized_center']);

function testBypass(user: any) {
  return process.env.NODE_ENV === 'test' && process.env.ALLOW_UNVERIFIED === 'true' && user?.isVerified === true;
}

export async function canPublishAnimals(user: any, shelterId?: string) {
  if (user?.role === 'admin') return true;
  const userId = String(shelterId || user?._id || user?.id || '');
  if (!userId) return false;
  if (testBypass(user) && userId === String(user?._id || user?.id || '')) return true;
  const v: any = await Verification.findOne({ userId }).select('status').lean();
  return v?.status === 'verified';
}

export async function canReceiveDonations(shelterId: string) {
  const v: any = await Verification.findOne({ userId: shelterId }).select('status verificationLevel').lean();
  return v?.status === 'verified' && donationLevels.has(v.verificationLevel);
}
