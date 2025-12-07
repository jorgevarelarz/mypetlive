import { api as client } from './client';

export type ProtectoraOption = {
  id: string;
  name: string;
};

export async function listProtectoras() {
  const { data } = await client.get('/api/protectoras');
  return data as { items: ProtectoraOption[] };
}
