import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { CalendarDays, MapPin } from 'lucide-react';
import { acceptAdoptionVisit, listMyAdoptionVisits, type AdoptionVisitItem } from '../../api/adoptions';
import { MPL, MPL_FONT_DISPLAY } from '../../styles/mypetlive';
import { toAbsoluteUrl } from '../../utils/media';
import { whenLong } from '../chat/chatFormat';
import OpenChatButton from '../chat/OpenChatButton';

export const VISITS_KEY = ['adoption-visits'];

/**
 * Visitas para conocer a un animal, en la página de Citas junto a las del
 * veterinario: el adoptante ve las suyas y la protectora las de sus animales.
 * Las propone la protectora desde el chat o desde la solicitud.
 */
export default function AdoptionVisitsPanel({ role }: { role: 'tenant' | 'landlord' }) {
  const q = useQuery({ queryKey: VISITS_KEY, queryFn: listMyAdoptionVisits });
  const [busy, setBusy] = useState<string | null>(null);
  const items = q.data || [];
  if (q.isLoading || q.isError || !items.length) return null;

  const now = Date.now();
  const upcoming = items.filter(i => new Date(i.visit.at).getTime() >= now - 3_600_000);
  const past = items.filter(i => new Date(i.visit.at).getTime() < now - 3_600_000).reverse();

  const accept = async (item: AdoptionVisitItem) => {
    setBusy(item.adoptionId);
    try {
      await acceptAdoptionVisit(item.adoptionId);
      toast.success('Visita aceptada');
      await q.refetch();
    } catch {
      toast.error('No se pudo aceptar la visita');
    } finally {
      setBusy(null);
    }
  };

  const card = (item: AdoptionVisitItem, isPast: boolean) => {
    const accepted = item.visit.status === 'aceptada';
    const who = role === 'tenant' ? item.shelterName : `${item.adopterName} quiere adoptarle`;
    return (
      <div key={item.adoptionId} data-visita={item.adoptionId}
        style={{ border: `1px solid ${MPL.border}`, borderRadius: 14, padding: 14, display: 'grid', gap: 10, background: '#fff', opacity: isPast ? .7 : 1 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, overflow: 'hidden', background: MPL.panel, flex: 'none', display: 'grid', placeItems: 'center', fontWeight: 800, color: MPL.tealDark }}>
            {item.animal?.photo
              ? <img src={toAbsoluteUrl(item.animal.photo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : (item.animal?.name || '?')[0]}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'inline-block', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 800, marginBottom: 4, background: accepted ? MPL.teal100 : MPL.gold100, color: accepted ? MPL.tealDark : MPL.goldDark }}>
              {isPast ? 'Pasada' : accepted ? 'Confirmada' : role === 'tenant' ? 'Por aceptar' : 'Esperando respuesta'}
            </span>
            <div style={{ fontWeight: 800, fontSize: 15 }}>Visita para conocer a {item.animal?.name || 'el animal'}</div>
            <div style={{ color: MPL.muted, fontSize: 13 }}>{who}</div>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 3 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 800 }}><CalendarDays size={16} style={{ flex: 'none' }} /> {whenLong(item.visit.at)}</div>
          {item.visit.place && <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: MPL.muted, fontSize: 13.5 }}><MapPin size={15} style={{ flex: 'none' }} /> {item.visit.place}</div>}
          {item.visit.note && <div style={{ color: MPL.muted, fontSize: 13.5, marginTop: 2 }}>{item.visit.note}</div>}
        </div>
        {!isPast && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {role === 'tenant' && !accepted && (
              <button type="button" onClick={() => accept(item)} disabled={busy === item.adoptionId}
                style={{ border: 0, background: MPL.teal, color: '#fff', borderRadius: 12, padding: '9px 15px', font: 'inherit', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
                {busy === item.adoptionId ? 'Un momento…' : 'Aceptar visita'}
              </button>
            )}
            <OpenChatButton kind="adoption" refId={item.adoptionId} label="Escribir" />
            <Link to={`/adoptions/${item.adoptionId}`} style={{ alignSelf: 'center', fontWeight: 800, fontSize: 14, color: MPL.tealDark, textDecoration: 'none', marginLeft: 4 }}>Ver solicitud ›</Link>
          </div>
        )}
      </div>
    );
  };

  return (
    <section style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 18, padding: 18, display: 'grid', gap: 12 }}>
      <h2 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 20, fontWeight: 800, margin: 0 }}>Visitas de adopción</h2>
      {upcoming.map(i => card(i, false))}
      {past.length > 0 && (
        <details>
          <summary style={{ cursor: 'pointer', color: MPL.muted, fontWeight: 800, fontSize: 13.5 }}>Visitas pasadas ({past.length})</summary>
          <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>{past.map(i => card(i, true))}</div>
        </details>
      )}
    </section>
  );
}
