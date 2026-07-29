import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Info } from 'lucide-react';
import { createDonationSession, donationErrorMessage } from '../api/donations';
import { DONATION_MIN_EUR, DONATION_MAX_EUR, formatEur } from '../utils/limits';
import { getAnimal } from '../api/animals';
import { listProtectoras } from '../api/patitas';
import { MPL, MPL_FONT_BODY, MPL_FONT_DISPLAY, PawMark } from '../styles/mypetlive';

const PRESETS = [5, 10, 20, 50];

export default function DonationsPage() {
  const [sp] = useSearchParams();
  const [amount, setAmount] = useState<string>('10');
  const [shelterId, setShelterId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const animalId = sp.get('animalId') || undefined;

  // Solo devuelve protectoras que pasan el gate del backend (`canReceiveDonations`),
  // así que la lista nunca ofrece a quien el checkout va a rechazar por verificación.
  const sheltersQuery = useQuery({ queryKey: ['donation-shelters'], queryFn: listProtectoras });
  const shelters = sheltersQuery.data?.items || [];

  // Con `?animalId` la donación va a la protectora de ese animal: hay que poder
  // nombrarla, porque el destinatario del dinero no puede ser un ObjectId.
  const animalQuery = useQuery({
    queryKey: ['donation-animal', animalId],
    queryFn: () => getAnimal(animalId as string),
    enabled: Boolean(animalId),
  });
  const animal = animalQuery.data;
  const animalShelterId = animal
    ? String(typeof animal.shelter === 'object' ? animal.shelter?._id || animal.shelter?.id : animal.shelter || '')
    : '';
  const animalShelterName = typeof animal?.shelter === 'object' ? animal.shelter?.name : undefined;

  // La protectora del animal puede no estar habilitada para cobrar: el backend
  // responde 403/409 y no tiene sentido dejar pulsar "Donar". Mientras la lista no
  // esté cargada no la damos por no habilitada, para no acusarla en falso.
  const shelterListUnknown = sheltersQuery.isLoading || sheltersQuery.isError;
  const animalShelterReady = !animalShelterId || shelterListUnknown || shelters.some(item => item.id === animalShelterId);

  const recipientName = animalId ? animalShelterName : shelters.find(item => item.id === shelterId)?.name;

  // Stripe vuelve con `?donation=success|cancel`. Hoy el backend redirige a la
  // portada, que no lee el parámetro (queda anotado como pendiente); aquí se lee
  // para que el retorno tenga respuesta si se apunta a esta página.
  useEffect(() => {
    if (sp.get('donation') === 'cancel') setError('Has cancelado el pago. No se te ha cobrado nada.');
  }, [sp]);

  const value = Number(amount);
  // El servidor tiene la última palabra sobre el tope; aquí solo se evita el
  // viaje a Stripe con un importe que sabemos que va a rechazar.
  const amountValid = Number.isFinite(value) && value >= DONATION_MIN_EUR && value <= DONATION_MAX_EUR;
  const recipientReady = animalId ? Boolean(animalShelterId) && animalShelterReady : Boolean(shelterId);
  const canDonate = amountValid && recipientReady && !submitting;

  const helpText = animalId && animalQuery.isError
    ? 'No hemos podido cargar la ficha de este animal, así que no sabemos a qué protectora dirigir tu donación.'
    : animalId && !animalShelterReady
      ? 'La protectora de este animal todavía no puede recibir donaciones por la plataforma.'
      : null;

  const startDonation = async () => {
    setError(null);
    if (!Number.isFinite(value) || value < DONATION_MIN_EUR) { setError(`La donación mínima es de ${DONATION_MIN_EUR} €.`); return; }
    if (value > DONATION_MAX_EUR) { setError(`El máximo por donación es de ${formatEur(DONATION_MAX_EUR)} €. Para donar más, escribe a la protectora.`); return; }
    if (!recipientReady) { setError('Elige a qué protectora quieres donar.'); return; }
    setSubmitting(true);
    try {
      // Sin `animalId` mandamos la protectora elegida; con él la deduce el backend.
      const session = await createDonationSession(value, animalId, animalId ? undefined : shelterId);
      if (session.url) {
        window.location.href = session.url;
        return;
      }
      // Antes un `url` vacío dejaba el botón como si no se hubiera pulsado.
      setError('Stripe no ha devuelto la pasarela de pago. Vuelve a intentarlo.');
      setSubmitting(false);
    } catch (e: any) {
      setError(donationErrorMessage(e));
      setSubmitting(false);
    }
  };

  return (
    <div style={{ fontFamily: MPL_FONT_BODY, color: MPL.ink, background: MPL.bg, minHeight: '100vh', padding: '32px 20px' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', display: 'grid', gap: 18 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: MPL.coral }}>
          <PawMark size={26} />
          <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 26, fontWeight: 800, color: MPL.ink, margin: 0 }}>Haz una donación</h1>
        </div>
        <p style={{ color: MPL.muted, margin: 0, fontSize: 14 }}>
          Tu aportación ayuda a las protectoras a seguir cuidando de los animales que buscan hogar.
        </p>

        <div style={{ background: MPL.card, border: `1px solid ${MPL.border}`, borderRadius: 18, padding: 22, display: 'grid', gap: 16 }}>
          {animalId ? (
            <div style={{ display: 'grid', gap: 4, fontSize: 13.5 }}>
              <span style={{ color: MPL.muted, fontWeight: 600 }}>Donación en nombre de</span>
              <strong style={{ fontSize: 15 }}>
                {animal?.name || (animalQuery.isLoading ? 'Cargando…' : 'este animal')}
                {animalShelterName ? ` · ${animalShelterName}` : ''}
              </strong>
            </div>
          ) : (
            <label style={{ display: 'grid', gap: 6, fontSize: 13, color: MPL.muted, fontWeight: 600 }}>
              Protectora destinataria
              <select
                value={shelterId}
                onChange={(e) => { setShelterId(e.target.value); setError(null); }}
                style={{ width: '100%', border: `1px solid ${MPL.border}`, borderRadius: 12, padding: '12px 14px', fontSize: 15, fontFamily: MPL_FONT_BODY, color: MPL.ink, background: '#fff' }}
              >
                <option value="">
                  {sheltersQuery.isLoading ? 'Cargando protectoras…' : 'Elige una protectora'}
                </option>
                {shelters.map(item => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </label>
          )}

          {sheltersQuery.isError && !animalId && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: MPL.goldDark, background: MPL.gold100, border: `1px solid ${MPL.gold}`, borderRadius: 12, padding: '11px 13px', fontSize: 13 }}>
              <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>No hemos podido cargar la lista de protectoras. Recarga la página para volver a intentarlo.</span>
            </div>
          )}

          {!sheltersQuery.isLoading && !sheltersQuery.isError && !animalId && shelters.length === 0 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: MPL.goldDark, background: MPL.gold100, border: `1px solid ${MPL.gold}`, borderRadius: 12, padding: '11px 13px', fontSize: 13 }}>
              <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>Todavía no hay ninguna protectora verificada para recibir donaciones. Vuelve pronto.</span>
            </div>
          )}

          {helpText && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: MPL.goldDark, background: MPL.gold100, border: `1px solid ${MPL.gold}`, borderRadius: 12, padding: '11px 13px', fontSize: 13 }}>
              <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                {helpText}{' '}
                {/* Sin el parámetro `animalId` la página muestra el selector de protectoras. */}
                <Link to="/donate" style={{ color: MPL.goldDark, fontWeight: 800 }}>Elegir la protectora a mano</Link>
              </span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PRESETS.map((p) => {
              const active = Number(amount) === p;
              return (
                <button
                  key={p}
                  onClick={() => { setAmount(String(p)); setError(null); }}
                  style={{
                    flex: '1 0 auto', minWidth: 70, padding: '10px 14px', borderRadius: 12, cursor: 'pointer',
                    fontFamily: MPL_FONT_BODY, fontWeight: 700, fontSize: 15,
                    border: `1.5px solid ${active ? MPL.teal : MPL.border}`,
                    background: active ? MPL.teal100 : '#fff',
                    color: active ? MPL.tealDark : MPL.ink,
                  }}
                >
                  {p} €
                </button>
              );
            })}
          </div>

          <label style={{ display: 'grid', gap: 6, fontSize: 13, color: MPL.muted, fontWeight: 600 }}>
            Otro importe (EUR) <span style={{ fontWeight: 500 }}>· máximo {formatEur(DONATION_MAX_EUR)} €</span>
            <input
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setError(null); }}
              type="number" step="1" min={DONATION_MIN_EUR} max={DONATION_MAX_EUR}
              style={{ width: '100%', border: `1px solid ${MPL.border}`, borderRadius: 12, padding: '12px 14px', fontSize: 15, fontFamily: MPL_FONT_BODY, color: MPL.ink, background: '#fff' }}
            />
          </label>

          {error && (
            <div role="alert" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: MPL.coralDark, background: MPL.coral100, border: `1px solid ${MPL.coral}`, borderRadius: 12, padding: '11px 13px', fontSize: 13 }}>
              <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={startDonation}
            disabled={!canDonate}
            style={{
              height: 50, borderRadius: 12, border: 'none', cursor: canDonate ? 'pointer' : 'not-allowed',
              background: canDonate ? MPL.coral : MPL.border, color: canDonate ? '#fff' : MPL.faint,
              fontFamily: MPL_FONT_BODY, fontWeight: 800, fontSize: 16,
            }}
          >
            {submitting ? 'Abriendo pago seguro…' : `Donar${amountValid ? ` ${value} €` : ''}${recipientName && !animalId ? ` a ${recipientName}` : ''}`}
          </button>

          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: MPL.muted, fontSize: 12.5, lineHeight: 1.5 }}>
            <Info size={16} style={{ flexShrink: 0, marginTop: 1, color: MPL.faint }} />
            <span>
              El dinero llega <strong>directamente a la cuenta bancaria de la protectora</strong>
              {recipientName ? ` (${recipientName})` : ''}. MyPetLive solo retiene una pequeña
              comisión de gestión sobre el importe. El pago lo procesa Stripe: MyPetLive no guarda los datos de tu tarjeta.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
