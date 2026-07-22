import { Router } from 'express';
import { Verification } from '../models/verification.model';
import { User } from '../models/user.model';
import { getUserId } from '../utils/getUserId';
import { requireAdmin } from '../middleware/requireAdmin';
import { authenticate } from '../middleware/auth.middleware';
import { isProduction } from '../utils/env';

const router = Router();

// All verification routes (except potential public webhooks) require an authenticated user.
router.use(authenticate as any);

// Retrieve current verification status for the authenticated user
router.get('/me', async (req, res) => {
  try {
    const userId = getUserId(req);
    const v = await Verification.findOne({ userId }).lean();
    if (!v) return res.json({ status: 'unverified' });
    res.json(v);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message, code: err.status || 500 });
  }
});

// Submit verification data by the user
router.post('/submit', async (req, res) => {
  try {
    const userId = getUserId(req);
    const {
      method,
      files,
      documents,
      legalName,
      nif,
      associationRegistryNumber,
      animalProtectionRegistryNumber,
      zoologicalCenterNumber,
      autonomousCommunity,
      representativeName,
      representativeRole,
    } = req.body || {};
    const v = await Verification.findOneAndUpdate(
      { userId },
      {
        $set: {
          method,
          files,
          documents,
          legalName,
          nif,
          associationRegistryNumber,
          animalProtectionRegistryNumber,
          zoologicalCenterNumber,
          autonomousCommunity,
          representativeName,
          representativeRole,
          status: 'pending',
          notes: '',
        },
      },
      { new: true, upsert: true, runValidators: true },
    );
    res.status(201).json(v);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message, code: err.status || 500 });
  }
});

// Admin lists verification requests (pending first) with basic user info
router.get('/pending', requireAdmin, async (req, res) => {
  try {
    const status = String(req.query.status || 'pending');
    const items = await Verification.find(status === 'all' ? {} : { status })
      .sort({ updatedAt: -1 })
      .limit(200)
      .lean();
    const users = await User.find({ _id: { $in: items.map(v => v.userId) } })
      .select('name email role')
      .lean();
    const byId = new Map(users.map(u => [String(u._id), u]));
    res.json({
      items: items.map(v => ({ ...v, user: byId.get(String(v.userId)) || null })),
    });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message, code: err.status || 500 });
  }
});

// Admin approves verification for a user
router.post('/:userId/approve', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { verificationLevel = 'animal_protection_entity' } = req.body || {};
    const v = await Verification.findOneAndUpdate(
      { userId },
      { $set: { status: 'verified', verificationLevel, notes: '' } },
      { new: true, upsert: true, runValidators: true },
    );
    res.json(v);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message, code: err.status || 500 });
  }
});

// Admin rejects verification for a user with notes
router.post('/:userId/reject', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { notes } = req.body || {};
    const v = await Verification.findOneAndUpdate(
      { userId },
      { $set: { status: 'rejected', notes } },
      { new: true, upsert: true },
    );
    res.json(v);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message, code: err.status || 500 });
  }
});

export default router;

// Dev helper: instantly verify current user if ALLOW_UNVERIFIED=true (non-prod).
// isProduction() y no NODE_ENV: en el VPS NODE_ENV es development a propósito, y esta
// ruta abierta permitía a cualquier cuenta autoverificarse (publicar animales, etc.).
router.post('/dev/verify', async (req, res) => {
  if (!(process.env.ALLOW_UNVERIFIED === 'true' && !isProduction())) {
    return res.status(403).json({ error: 'forbidden' });
  }
  try {
    const userId = getUserId(req);
    const v = await Verification.findOneAndUpdate(
      { userId },
      { $set: { status: 'verified' } },
      { upsert: true, new: true },
    );
    res.json(v);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message, code: err.status || 500 });
  }
});
