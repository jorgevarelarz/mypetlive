import fs from 'fs';
import path from 'path';
import type { Request } from 'express';
import logger from './logger';
import { LegalDocument, LegalSlug } from '../models/legalDocument.model';
import { LegalAcceptance } from '../models/legalAcceptance.model';
import { User } from '../models/user.model';

// v2 son los primeros textos propios de MyPetLive: los v1 eran plantillas
// heredadas de RentalApp que además nunca llegaron a servirse (la imagen no
// copiaba legal/), así que ninguna aceptación previa de "v1" es válida.
const termsVersion = process.env.TERMS_VERSION || 'v2';
const privacyVersion = process.env.PRIVACY_VERSION || 'v2';
const tenantProConsentVersion = process.env.TENANT_PRO_CONSENT_VERSION || 'v1';
const legalNoticeVersion = process.env.LEGAL_NOTICE_VERSION || 'v1';
const cookiesVersion = process.env.COOKIES_VERSION || 'v1';

const fallbackVersions: Record<LegalSlug, string> = {
  terms: termsVersion,
  privacy: privacyVersion,
  'tenant-pro-consent': tenantProConsentVersion,
  'legal-notice': legalNoticeVersion,
  cookies: cookiesVersion,
};

function readLegalDocument(slug: LegalSlug, version: string) {
  const filePath = path.resolve(process.cwd(), `legal/${slug}_${version}.md`);
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    logger.error({ err: error, slug, version }, '[legal] No se pudo leer documento legal');
    return null;
  }
}

export async function getLatestLegalDoc(slug: LegalSlug) {
  const doc = await LegalDocument.findOne({ slug }).sort({ createdAt: -1 }).lean();
  if (doc) return doc;

  const fallbackVersion = fallbackVersions[slug];
  const content = readLegalDocument(slug, fallbackVersion);
  if (!content) return null;
  return { slug, version: fallbackVersion, content };
}

export function getAcceptanceFields(slug: LegalSlug) {
  if (slug === 'terms') {
    return { acceptedAtField: 'termsAcceptedAt', versionField: 'termsVersionAccepted', legalVersion: true } as const;
  }
  if (slug === 'privacy') {
    return { acceptedAtField: 'privacyAcceptedAt', versionField: 'privacyVersionAccepted', legalVersion: false } as const;
  }
  return null;
}

/**
 * Guarda que el usuario acepta `version` de `slug`: los campos del usuario que
 * lee /legal/status y, aparte, el rastro append-only con IP y dispositivo.
 * Lo usan /legal/accept y el registro (casilla «Acepto…» del formulario).
 */
export async function recordLegalAcceptance(userId: any, slug: LegalSlug, version: string, req: Request) {
  const fields = getAcceptanceFields(slug);
  if (!fields) throw new Error(`unsupported_slug:${slug}`);
  const acceptedAt = new Date();
  const update: Record<string, any> = {
    [fields.acceptedAtField]: acceptedAt,
    [fields.versionField]: version,
  };
  if (fields.legalVersion) {
    update.legalVersion = version;
  }
  await User.findByIdAndUpdate(userId, { $set: update }, { new: true });
  // Prueba del consentimiento, aparte del usuario: aquí no se pisa nada.
  await LegalAcceptance.create({
    userId,
    slug,
    version,
    acceptedAt,
    ip: req.ip,
    userAgent: req.header('user-agent'),
  });
}
