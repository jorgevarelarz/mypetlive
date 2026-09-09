import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Ensure upload directory exists
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Los formatos que de verdad necesitamos servir. La extensión con la que se
// guarda y se sirve el fichero sale SIEMPRE de aquí, nunca del nombre ni del
// Content-Type que declare el cliente: eso es lo que permitía subir HTML
// disfrazado de imagen y que /uploads lo sirviera como text/html (XSS
// almacenado). Detectar por firma binaria (magic bytes) es la única
// comprobación que no se puede falsear desde el formulario.
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

function persistFile(file: Express.Multer.File): { filename: string } | null {
  const detected = detectFileType(file.buffer);
  if (!detected) return null;
  const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}${detected.ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), file.buffer);
  return { filename };
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
router.post('/uploads/images', authenticate as any, (req, res) => {
  upload.array('files', 6)(req as any, res as any, (err: any) => {
    if (err) return res.status(400).json({ error: err.message || 'upload_error' });
    const files = ((req as any).files as Express.Multer.File[]) || [];
    if (files.length === 0) return res.status(400).json({ error: 'missing_file' });
    const persisted = files.map(persistFile);
    if (persisted.some(p => p === null)) return res.status(400).json({ error: 'invalid_file_type' });
    const base = getBaseUrl(req);
    const filenames = persisted.map(p => p!.filename);
    const urls = filenames.map(name => `${base}/uploads/${name}`);
    res.json({ filenames, urls });
  });
});

// POST /api/uploads (single file)
router.post('/uploads', authenticate as any, (req, res) => {
  upload.single('file')(req as any, res as any, (err: any) => {
    if (err) return res.status(400).json({ error: err.message || 'upload_error' });
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ error: 'missing_file' });
    const persisted = persistFile(file);
    if (!persisted) return res.status(400).json({ error: 'invalid_file_type' });
    const base = getBaseUrl(req);
    const url = `${base}/uploads/${persisted.filename}`;
    res.json({ url, filename: persisted.filename });
  });
});

export default router;
