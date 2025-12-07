import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createDonationSession } from '../api/donations';
import { toast } from 'react-hot-toast';

export default function DonationsPage() {
  const [sp] = useSearchParams();
  const [amount, setAmount] = useState<string>('10');
  const animalId = sp.get('animalId') || undefined;

  const startDonation = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) { toast.error('Importe inválido'); return; }
    try {
      const session = await createDonationSession(value, animalId);
      if (session.url) window.location.href = session.url;
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'No se pudo iniciar la donación');
    }
  };

  return (
    <div className="p-4 grid gap-3">
      <h1 className="text-xl font-semibold">Donaciones</h1>
      <div className="max-w-md border rounded p-3 grid gap-2">
        <label className="text-sm text-gray-700">Importe (EUR)</label>
        <input value={amount} onChange={(e)=>setAmount(e.target.value)} type="number" step="1" min="1" className="border rounded px-2 py-1" />
        <button onClick={startDonation} className="px-4 py-2 rounded bg-emerald-600 text-white">Donar</button>
        {animalId && <div className="text-xs text-gray-500">Animal: {animalId}</div>}
      </div>
    </div>
  );
}

