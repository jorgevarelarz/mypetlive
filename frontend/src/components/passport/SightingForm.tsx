import React from 'react';
import { MapPin, Check } from 'lucide-react';
import { reportSighting } from '../../api/animals';
import { MPL, MPL_FONT_DISPLAY } from '../../styles/mypetlive';

// «¿Has visto a Luna?»: lo que rellena quien encuentra a un animal perdido y
// escanea su chapa. Sin cuenta. El servidor reenvía el aviso a la familia (al
// móvil y al correo) y quien avisa nunca ve los datos de la familia.
//
// La ubicación es lo más útil y lo primero: con el animal delante y el móvil en
// la mano, un toque. Basta con una de las tres cosas (ubicación, mensaje o
// contacto); el servidor rechaza el aviso vacío.

type Props = { code: string; name: string };
type Geo = { lat: number; lng: number; accuracy?: number };

const input: React.CSSProperties = {
  border: `1px solid ${MPL.border}`, borderRadius: 12, padding: '0 12px', font: 'inherit', fontSize: 16,
  fontWeight: 400, color: MPL.ink, background: '#fff', width: '100%', boxSizing: 'border-box',
};

const GEO_ERROR: Record<number, string> = {
  1: 'No nos has dado permiso para ver dónde estás. Puedes contarlo en el mensaje.',
  2: 'No hemos podido saber dónde estás. Puedes contarlo en el mensaje.',
  3: 'Está tardando demasiado. Inténtalo otra vez o cuéntalo en el mensaje.',
};

export default function SightingForm({ code, name }: Props) {
  const [geo, setGeo] = React.useState<Geo | null>(null);
  const [locating, setLocating] = React.useState(false);
  const [geoError, setGeoError] = React.useState<string | null>(null);
  const [note, setNote] = React.useState('');
  const [contact, setContact] = React.useState('');
  const [state, setState] = React.useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = React.useState<string | null>(null);

  const locate = () => {
    if (!('geolocation' in navigator)) {
      setGeoError(GEO_ERROR[2]);
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setLocating(false);
      },
      err => {
        setGeoError(GEO_ERROR[err.code] || GEO_ERROR[2]);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  };

  const canSend = Boolean(geo || note.trim() || contact.trim());

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) {
      setError('Comparte dónde estás o escribe algo: con eso basta.');
      return;
    }
    setState('sending');
    setError(null);
    try {
      await reportSighting(code, {
        ...(geo || {}),
        note: note.trim() || undefined,
        contact: contact.trim() || undefined,
      });
      setState('sent');
    } catch (err: any) {
      setState('idle');
      const status = err?.response?.status;
      const reason = err?.response?.data?.error;
      setError(
        status === 429
          ? 'Has enviado varios avisos seguidos. Espera unos minutos e inténtalo otra vez.'
          : reason === 'not_lost'
            ? `Su familia ya ha marcado que ${name} ha aparecido. ¡Gracias!`
            : 'No se ha podido enviar. Comprueba la conexión e inténtalo otra vez.',
      );
    }
  };

  if (state === 'sent') {
    return (
      <div style={{ marginTop: 14, background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 14, padding: 16, display: 'flex', gap: 10 }}>
        <Check size={22} color={MPL.oliveDark} style={{ flexShrink: 0 }} aria-hidden />
        <div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Gracias. Hemos avisado a su familia.</div>
          <div style={{ fontSize: 14.5, color: MPL.muted, marginTop: 4 }}>
            Les llega ahora mismo{contact.trim() ? ', con tu contacto para que puedan llamarte' : ''}. Si puedes, quédate cerca de {name}.
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={send} style={{ marginTop: 14, background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 14, padding: 16, display: 'grid', gap: 12 }}>
      <div style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 19, fontWeight: 800 }}>¿Has visto a {name}?</div>

      {geo ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, color: MPL.oliveDark }}>
          <Check size={18} aria-hidden /> Ubicación lista{geo.accuracy ? ` (±${Math.round(geo.accuracy)} m)` : ''}
          <button type="button" onClick={() => setGeo(null)} style={{ marginLeft: 'auto', padding: 0, border: 0, background: 'none', color: MPL.muted, font: 'inherit', fontSize: 14, fontWeight: 600, textDecoration: 'underline' }}>
            Quitar
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={locate}
          disabled={locating}
          style={{ height: 50, borderRadius: 12, border: `1.5px solid ${MPL.teal}`, background: '#fff', color: MPL.teal, font: 'inherit', fontWeight: 800, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <MapPin size={18} aria-hidden /> {locating ? 'Buscando dónde estás…' : 'Compartir dónde estoy'}
        </button>
      )}
      {geoError && <div style={{ fontSize: 14, color: MPL.muted }}>{geoError}</div>}

      <label style={{ display: 'grid', gap: 6, fontSize: 15, fontWeight: 700 }}>
        ¿Qué has visto?
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Ej.: Está en la puerta del supermercado y se deja acercar"
          style={{ ...input, padding: 12, resize: 'vertical' }}
        />
      </label>

      <label style={{ display: 'grid', gap: 6, fontSize: 15, fontWeight: 700 }}>
        Cómo contactarte <span style={{ fontWeight: 400, fontSize: 13.5, color: MPL.muted, marginTop: -4 }}>Opcional. Teléfono o correo, solo lo verá su familia.</span>
        <input value={contact} onChange={e => setContact(e.target.value)} maxLength={120} inputMode="text" autoComplete="tel" style={{ ...input, height: 46 }} />
      </label>

      {error && <div style={{ fontSize: 14, color: '#8F3827' }}>{error}</div>}

      <button
        type="submit"
        disabled={state === 'sending'}
        style={{ height: 52, borderRadius: 14, border: 0, background: MPL.coral, color: '#fff', font: 'inherit', fontWeight: 800, fontSize: 16, opacity: state === 'sending' ? 0.7 : 1 }}
      >
        {state === 'sending' ? 'Enviando…' : 'Avisar a su familia'}
      </button>
    </form>
  );
}
