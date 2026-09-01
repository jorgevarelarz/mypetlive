import { api as client } from './client';

export type TagStatus = 'libre' | 'vinculada' | 'anulada';

export type TagResolution = {
  status: TagStatus;
  code: string;
  animal?: { code: string; name: string };
};

export async function resolveTag(code: string) {
  const { data } = await client.get(`/api/tags/${encodeURIComponent(code)}`);
  return data as TagResolution;
}

// El código que se teclea aquí es el DEL ANIMAL (NOMBRE-NNN), no el de la chapa.
export async function claimTag(code: string, animalCode: string) {
  const { data } = await client.post(`/api/tags/${encodeURIComponent(code)}/claim`, { animalCode });
  return data as TagResolution & { ok: boolean };
}

export async function releaseTag(code: string) {
  const { data } = await client.post(`/api/tags/${encodeURIComponent(code)}/release`);
  return data as TagResolution & { ok: boolean };
}

export async function listMyTags() {
  const { data } = await client.get('/api/tags/mine');
  return data as {
    items: Array<{
      code: string;
      claimedAt: string | null;
      scans: number;
      lastScanAt: string | null;
      animal: { code: string; name: string; images: string[] } | null;
    }>;
  };
}
