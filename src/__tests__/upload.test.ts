import request from 'supertest';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { startMongoMemoryServer } from './utils/mongoMemoryServer';

/**
 * Regresión de la auditoría del 5 sep 2026 (hallazgo alta #1): `POST
 * /api/uploads` conservaba la extensión del nombre de fichero y confiaba en
 * el Content-Type declarado por el cliente. Un `audit.html` subido como
 * `image/png` se guardaba tal cual y `/uploads` lo servía como `text/html`
 * con el `<script>` intacto: XSS almacenado en el propio dominio.
 */

let app: any;
let mongo: MongoMemoryServer | undefined;
const uploadHeaders = { 'x-user-id': new mongoose.Types.ObjectId().toHexString(), 'x-user-role': 'tenant' };

beforeAll(async () => {
  mongo = await startMongoMemoryServer();
  process.env.MONGO_URL = mongo.getUri();
  process.env.NODE_ENV = 'test';
  const mod = await import('../app');
  app = mod.app || mod.default;
});

afterAll(async () => {
  await mongoose.connection.close();
  if (mongo) await mongo.stop();
});

describe('Subida de ficheros', () => {
  it('rechaza HTML disfrazado de imagen, aunque declare image/png y termine en .png', async () => {
    const res = await request(app)
      .post('/api/uploads')
      .set(uploadHeaders)
      .attach(
        'file',
        Buffer.from('<!doctype html><script>document.title="pwned"</script>'),
        { filename: 'audit.png', contentType: 'image/png' },
      );
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_file_type');
  });

  it('acepta un PNG real y lo sirve con el Content-Type correcto, nunca text/html', async () => {
    // Cabecera PNG mínima válida (firma de 8 bytes que `detectFileType` reconoce).
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const uploaded = await request(app)
      .post('/api/uploads')
      .set(uploadHeaders)
      .attach('file', png, { filename: 'foto.png', contentType: 'image/png' })
      .expect(200);

    expect(uploaded.body.filename).toMatch(/\.png$/);
    const served = await request(app).get(`/uploads/${uploaded.body.filename}`).expect(200);
    expect(served.headers['content-type']).toMatch(/^image\/png/);
  });

  it('el nombre servido nunca es el original: una extensión .html en el nombre no sobrevive', async () => {
    const res = await request(app)
      .post('/api/uploads')
      .set(uploadHeaders)
      .attach(
        'file',
        Buffer.from('<!doctype html><script>alert(1)</script>'),
        { filename: 'no-soy-imagen.html', contentType: 'text/html' },
      );
    expect(res.status).toBe(400);
  });
});
