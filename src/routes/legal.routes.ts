import { Router, Request, Response } from 'express';
import { body, param } from 'express-validator';
import { LegalDocument, LegalSlug } from '../models/legalDocument.model';
import { LegalAcceptance } from '../models/legalAcceptance.model';
import asyncHandler from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth.middleware';
import { requireVerified } from '../middleware/requireVerified';
import { requireAdmin } from '../middleware/requireAdmin';
import { validate } from '../middleware/validate';
import { getUserId } from '../utils/getUserId';
import { User } from '../models/user.model';
import { getLatestLegalDoc, getAcceptanceFields, recordLegalAcceptance } from '../utils/legalDocs';

const router = Router();

const legalSlugs: LegalSlug[] = ['terms', 'privacy', 'tenant-pro-consent', 'legal-notice', 'cookies'];

router.use('/legal/admin', authenticate as any, requireVerified as any, requireAdmin as any);

// OJO AL ORDEN: '/legal/status' y '/legal/admin/*' tienen que declararse ANTES
// que '/legal/:slug'. Si no, la ruta dinámica captura "status" como slug, el
// validador isIn(legalSlugs) lo rechaza y /api/legal/status responde 400.
router.get(
  '/legal/status',
  authenticate as any,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const user: any = await User.findById(userId)
      .select('termsAcceptedAt termsVersionAccepted privacyAcceptedAt privacyVersionAccepted legalVersion')
      .lean();

    const [termsDoc, privacyDoc] = await Promise.all([getLatestLegalDoc('terms'), getLatestLegalDoc('privacy')]);

    res.json({
      terms: {
        latest: termsDoc,
        acceptedVersion: user?.termsVersionAccepted || null,
        acceptedAt: user?.termsAcceptedAt || null,
      },
      privacy: {
        latest: privacyDoc,
        acceptedVersion: user?.privacyVersionAccepted || null,
        acceptedAt: user?.privacyAcceptedAt || null,
      },
    });
  }),
);

router.get(
  '/legal/admin/:slug',
  [param('slug').isIn(legalSlugs).withMessage('slug_invalid')],
  validate,
  asyncHandler(async (req: Request, res: Response) => {
    const slug = req.params.slug as LegalSlug;
    const docs = await LegalDocument.find({ slug })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json({ items: docs });
  }),
);

router.post(
  '/legal/admin/:slug',
  [
    param('slug').isIn(legalSlugs).withMessage('slug_invalid'),
    body('version').isString().trim().isLength({ min: 1, max: 32 }).withMessage('version_invalid'),
    body('content').isString().trim().isLength({ min: 10 }).withMessage('content_invalid'),
  ],
  validate,
  asyncHandler(async (req: Request, res: Response) => {
    const slug = req.params.slug as LegalSlug;
    const { version, content } = req.body as { version: string; content: string };
    const createdBy = getUserId(req);

    const doc = await LegalDocument.create({ slug, version, content, createdBy });
    res.status(201).json({ ok: true, doc });
  }),
);

router.post(
  '/legal/accept',
  [
    body('slug').isIn(['terms', 'privacy']).withMessage('slug_invalid'),
    body('version').isString().trim().isLength({ min: 1, max: 64 }).withMessage('version_invalid'),
  ],
  validate,
  authenticate as any,
  asyncHandler(async (req: Request, res: Response) => {
    const slug = req.body.slug as LegalSlug;
    const version = String(req.body.version);
    const userId = getUserId(req);

    const latest = await getLatestLegalDoc(slug);
    if (!latest) {
      return res.status(400).json({ error: 'legal-text-unavailable', slug });
    }
    if (latest.version !== version) {
      return res.status(409).json({ error: 'outdated_version', expected: latest.version, received: version });
    }

    if (!getAcceptanceFields(slug)) {
      return res.status(400).json({ error: 'unsupported_slug' });
    }
    await recordLegalAcceptance(userId, slug, version, req);

    res.json({ ok: true, slug, version });
  }),
);

// Va la ÚLTIMA a propósito: es la ruta comodín de /legal/* y taparía a
// '/legal/status' y '/legal/admin/:slug' si se declarase antes.
router.get(
  '/legal/:slug',
  [param('slug').isIn(legalSlugs).withMessage('slug_invalid')],
  validate,
  asyncHandler(async (req: Request, res: Response) => {
    const slug = req.params.slug as LegalSlug;
    const doc = await getLatestLegalDoc(slug);
    if (!doc) {
      return res.status(404).json({ error: 'legal-text-unavailable', slug });
    }
    res.json(doc);
  }),
);

export default router;
