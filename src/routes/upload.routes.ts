import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Ensure upload directory exists
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Los formatos que de verdad necesitamos servir. La extensión con la que se
// guarda y se sirve el fichero sale SIEMPRE de aquí, nunca del nombre ni del
// Content-Type que declare el cliente: eso es lo que permitía subir HTML
// disfrazado de imagen y que /uploads lo sirviera como text/html (XSS
// almacenado). Las imágenes se decodifican además antes de guardarse.
function detectFileType(buf: Buffer): { ext: string; mime: string } | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { ext: '.png', mime: 'image/png' };
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: '.jpg', mime: 'image/jpeg' };
  }
  if (buf.length >= 6 && (buf.subarray(0, 6).toString('ascii') === 'GIF87a' || buf.subarray(0, 6).toString('ascii') === 'GIF89a')) {
    return { ext: '.gif', mime: 'image/gif' };
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { ext: '.webp', mime: 'image/webp' };
  }
  if (buf.length >= 5 && buf.subarray(0, 5).toString('ascii') === '%PDF-') {
    return { ext: '.pdf', mime: 'application/pdf' };
  }
  return null;
}

// Buffer en memoria: hace falta el fichero completo para mirar la firma antes
// de decidir con qué nombre (y por tanto con qué extensión) se escribe a disco.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 6 } });

async function persistFiles(files: Express.Multer.File[], imagesOnly = false): Promise<string[] | null> {
  const prepared: Array<{ filename: string; buffer: Buffer }> = [];
  for (const file of files) {
    const detected = detectFileType(file.buffer);
    if (!detected || (imagesOnly && detected.ext === '.pdf')) return null;
    let buffer = file.buffer;
    let ext = detected.ext;
    if (detected.mime.startsWith('image/')) {
      try {
        buffer = await sharp(buffer, { limitInputPixels: 40_000_000, failOn: 'warning' })
          .rotate().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 82 }).toBuffer();
        ext = '.webp';
      } catch {
        return null;
      }
    }
    prepared.push({ filename: `${randomUUID()}${ext}`, buffer });
  }
  try {
    for (const file of prepared) await fs.promises.writeFile(path.join(UPLOAD_DIR, file.filename), file.buffer, { flag: 'wx' });
  } catch (err) {
    await Promise.allSettled(prepared.map(file => fs.promises.unlink(path.join(UPLOAD_DIR, file.filename))));
    throw err;
  }
  return prepared.map(file => file.filename);
}

// Utility to build absolute base URL
function getBaseUrl(req: any): string {
  const envBase = process.env.APP_URL?.replace(/\/$/, '') || '';
  if (envBase) return envBase;
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  const host = req.get('host');
  return `${proto}://${host}`;
}

// POST /api/uploads/images (multiple)
router.post('/uploads/images', authenticate as any, (req, res, next) => {
  upload.array('files', 6)(req as any, res as any, async (err: any) => {
    try {
    if (err) return res.status(400).json({ error: err.message || 'upload_error' });
    const files = ((req as any).files as Express.Multer.File[]) || [];
    if (files.length === 0) return res.status(400).json({ error: 'missing_file' });
    const filenames = await persistFiles(files, true);
    if (!filenames) return res.status(400).json({ error: 'invalid_file_type' });
    const base = getBaseUrl(req);
    const urls = filenames.map(name => `${base}/uploads/${name}`);
    res.json({ filenames, urls });
    } catch (err) { next(err); }
  });
});

// POST /api/uploads (single file)
router.post('/uploads', authenticate as any, (req, res, next) => {
  upload.single('file')(req as any, res as any, async (err: any) => {
    try {
    if (err) return res.status(400).json({ error: err.message || 'upload_error' });
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ error: 'missing_file' });
    const filenames = await persistFiles([file]);
    if (!filenames) return res.status(400).json({ error: 'invalid_file_type' });
    const filename = filenames[0];
    const base = getBaseUrl(req);
    const url = `${base}/uploads/${filename}`;
    res.json({ url, filename });
    } catch (err) { next(err); }
  });
});

export default router;
