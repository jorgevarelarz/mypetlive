import { authenticate } from './auth.middleware';
import { authorizeRoles } from './role.middleware';

// MyPetLive no requiere verificación KYC para adoptar/operar: adoptar es gratis
// y la verificación tendría un coste innecesario. Por eso assertRole solo exige
// autenticación + rol, sin requireVerified. (Stripe ya cubre identidad en pagos.)
export const assertRole = (...roles: string[]) => [authenticate as any, authorizeRoles(...roles) as any];

