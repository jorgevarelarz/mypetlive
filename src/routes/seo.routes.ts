import { Router, Request, Response } from 'express';
import { Animal } from '../models/animal.model';
import asyncHandler from '../utils/asyncHandler';

const router = Router();

const SITE_URL = (process.env.FRONTEND_URL || process.env.APP_URL || 'https://mypetlive.es').replace(/\/$/, '');
// Estados visibles públicamente (coinciden con la visibilidad del catálogo).
const PUBLIC_STATUSES = ['publicado', 'reservado', 'preadoptado'];

const SPECIES_LABEL: Record<string, string> = { perro: 'Perro', gato: 'Gato', otro: 'Animal' };
const SIZE_LABEL: Record<string, string> = { small: 'pequeño', medium: 'mediano', large: 'grande' };
const SEX_LABEL: Record<string, string> = { male: 'macho', female: 'hembra' };

function escapeHtml(input = ''): string {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildDescription(a: any): string {
  if (a.description && a.description.trim()) return a.description.trim();
  const parts = [
    SPECIES_LABEL[a.species] || a.species,
    a.breed,
    a.sex ? SEX_LABEL[a.sex] : null,
    a.size ? `tamaño ${SIZE_LABEL[a.size] || a.size}` : null,
    a.age,
    a.city ? `en ${a.city}` : null,
  ].filter(Boolean);
  return `${parts.join(' · ')}. Disponible para adopción responsable en MyPetLive.`;
}

/**
 * HTML con meta Open Graph por animal para crawlers (WhatsApp, Facebook,
 * Twitter, LinkedIn, Google…). Apache enruta aquí los bots que piden
 * /animals/:id; los humanos reciben la SPA. Incluye redirección por si un
 * humano aterriza directamente.
 */
router.get(
  '/og/animals/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const canonical = `${SITE_URL}/animals/${encodeURIComponent(req.params.id)}`;
    let animal: any = null;
    if (/^[a-f\d]{24}$/i.test(req.params.id)) {
      animal = await Animal.findOne({ _id: req.params.id, status: { $in: PUBLIC_STATUSES } }).lean();
    }

    const title = animal
      ? `${animal.name} en adopción · MyPetLive`
      : 'Adopción responsable · MyPetLive';
    const description = animal
      ? buildDescription(animal)
      : 'Encuentra a tu próximo compañero y apoya a las protectoras en MyPetLive.';
    const image =
      (animal && Array.isArray(animal.images) && animal.images[0]) || `${SITE_URL}/logo512.png`;

    const jsonLd = animal
      ? JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: animal.name,
          description,
          image: animal.images || [],
          category: SPECIES_LABEL[animal.species] || animal.species,
          url: canonical,
          brand: { '@type': 'Organization', name: 'MyPetLive' },
        })
      : null;

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="MyPetLive">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:url" content="${canonical}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(image)}">
${jsonLd ? `<script type="application/ld+json">${jsonLd}</script>` : ''}
<meta http-equiv="refresh" content="0; url=${canonical}">
</head>
<body>
<p>Redirigiendo a <a href="${canonical}">${escapeHtml(title)}</a>…</p>
<script>window.location.replace(${JSON.stringify(canonical)});</script>
</body>
</html>`);
  }),
);

/**
 * OG del pasaporte por código (/p/:code). Para que al compartir el enlace del
 * pasaporte salga una tarjeta bonita. Funciona con cualquier código (también
 * mascotas adoptadas), pero NUNCA expone datos del dueño.
 */
router.get(
  '/og/p/:code',
  asyncHandler(async (req: Request, res: Response) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    const canonical = `${SITE_URL}/p/${encodeURIComponent(code)}`;
    const animal: any = await Animal.findOne({ code }).lean();

    const title = animal ? `${animal.name} · Pasaporte MyPetLive (${animal.code})` : 'Pasaporte MyPetLive';
    const description = animal ? buildDescription(animal) : 'Pasaporte digital de mascota en MyPetLive.';
    const image = (animal && Array.isArray(animal.images) && animal.images[0]) || `${SITE_URL}/logo512.png`;

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="MyPetLive">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:url" content="${canonical}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:image" content="${escapeHtml(image)}">
<meta http-equiv="refresh" content="0; url=${canonical}">
</head>
<body><script>window.location.replace(${JSON.stringify(canonical)});</script></body>
</html>`);
  }),
);

/** Sitemap dinámico: páginas estáticas + cada animal público. */
router.get(
  '/sitemap.xml',
  asyncHandler(async (_req: Request, res: Response) => {
    const animals = await Animal.find({ status: { $in: PUBLIC_STATUSES } })
      .select('_id code updatedAt')
      .sort({ updatedAt: -1 })
      .limit(5000)
      .lean();

    const staticUrls = [
      { loc: `${SITE_URL}/`, priority: '1.0' },
      { loc: `${SITE_URL}/animals`, priority: '0.9' },
    ];

    const urls = [
      ...staticUrls.map(u => `<url><loc>${u.loc}</loc><changefreq>daily</changefreq><priority>${u.priority}</priority></url>`),
      ...animals.flatMap(a => {
        const lastmod = a.updatedAt ? new Date(a.updatedAt as any).toISOString() : new Date().toISOString();
        const entries = [`<url><loc>${SITE_URL}/animals/${a._id}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`];
        if (a.code) entries.push(`<url><loc>${SITE_URL}/p/${a.code}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`);
        return entries;
      }),
    ];

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`);
  }),
);

export default router;
