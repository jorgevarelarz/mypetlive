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
