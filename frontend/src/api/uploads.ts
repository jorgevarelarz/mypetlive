import { api as client, API_BASE } from './client';

export async function uploadImage(file: File): Promise<{ url: string }> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await client.post('/api/uploads', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  const filename = data?.filename || data?.filenames?.[0];
  const baseUrl = API_BASE || (process.env.REACT_APP_API_URL || 'http://localhost:3000');
  if (filename) {
    return { url: `${baseUrl}/uploads/${filename}` };
  }
  if (data?.url) return { url: data.url };
  return { url: `${baseUrl}/uploads/${Date.now()}` };
}

// Documentos de verificación (AUD-5): se suben a la zona privada y solo los ven
// su titular y los admins. La URL que se guarda es la ruta de la API.
export async function uploadPrivateDocument(file: File): Promise<{ url: string }> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await client.post('/api/uploads/private', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  return { url: String(data?.url || '') };
}

/** Abre un documento: los privados se piden con la sesión y se abren como blob. */
export async function abrirDocumento(url: string) {
  if (!url.startsWith('/api/uploads/private/')) { window.open(url, '_blank', 'noopener'); return; }
  const ventana = window.open('', '_blank');
  const { data, headers } = await client.get(url, { responseType: 'blob' });
  const blob = new Blob([data], { type: String(headers['content-type'] || 'application/octet-stream') });
  const href = URL.createObjectURL(blob);
  if (ventana) ventana.location.href = href; else window.location.href = href;
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}
