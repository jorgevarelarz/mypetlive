import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { User } from '../models/user.model';

export type PosKeyMode = 'live' | 'test';

// Autenticación machine-to-machine del TPV del partner por cabecera X-Api-Key.
// La clave (mpl_pos_… o mpl_pos_test_…) solo existe en claro en el TPV; aquí se
// compara su sha256 contra las claves del partner (array posApiKeys con etiqueta
// y revocación individual, más la clave legado posApiKeyHash).
export async function posAuth(req: Request, res: Response, next: NextFunction) {
  const key = String(req.header('x-api-key') || '');
  if (!key.startsWith('mpl_pos_') || key.length < 40 || key.length > 200) {
    return res.status(401).json({ error: 'invalid_api_key' });
  }
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  const partner: any = await User.findOne({
    $or: [{ posApiKeyHash: hash }, { 'posApiKeys.hash': hash }],
  }).select('name role profile.orgName profile.commissionPct +posApiKeys +posApiKeyHash');
  if (!partner || !['store', 'vet'].includes(partner.role)) {
    return res.status(401).json({ error: 'invalid_api_key' });
  }

  const matched = (partner.posApiKeys || []).find((k: any) => k.hash === hash);
  const mode: PosKeyMode = matched?.mode === 'test' ? 'test' : 'live';
  (req as any).posKeyMode = mode;

  // Marca de última llamada para diagnóstico: sin await para no añadir latencia
  // a cada request del TPV; si falla, no afecta a la venta.
  const touch = matched
    ? User.updateOne(
        { _id: partner._id, 'posApiKeys.hash': hash },
        { 'posApiKeys.$.lastUsedAt': new Date() },
      )
    : User.updateOne({ _id: partner._id }, { posApiKeyLastUsedAt: new Date() });
  touch.exec().catch(() => {});

  (req as any).user = partner;
  next();
}
