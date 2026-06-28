import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Tag, Trash2 } from 'lucide-react';
import { listVetOffers, createVetOffer, toggleVetOffer, deleteVetOffer } from '../../api/vetOffers';
import { MPL, MPL_FONT_DISPLAY } from '../../styles/mypetlive';

const card: React.CSSProperties = { background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 18, padding: 22 };
const inputStyle: React.CSSProperties = { border: `1.5px solid ${MPL.border}`, borderRadius: 12, padding: '11px 13px', font: 'inherit', width: '100%', boxSizing: 'border-box', background: '#fff' };

const SERVICE_TYPES = ['Vacunación', 'Desparasitación', 'Revisión', 'Cirugía', 'Análisis', 'Microchip', 'Urgencias', 'Otro'];
const SPECIES = [{ v: 'cat', l: 'Gato' }, { v: 'dog', l: 'Perro' }, { v: 'rabbit', l: 'Conejo' }, { v: 'bird', l: 'Ave' }];

export default function VetOffersPanel() {
  const queryClient = useQueryClient();
  const [copy, setCopy] = useState('');
  const [discount, setDiscount] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [species, setSpecies] = useState<string[]>([]);
  const [city, setCity] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  const offersQ = useQuery({ queryKey: ['vet-offers'], queryFn: listVetOffers });
  const offers = offersQ.data?.items || [];

  const reset = () => { setCopy(''); setDiscount(''); setServiceType(''); setSpecies([]); setCity(''); setExpiresAt(''); };

  const createMut = useMutation({
    mutationFn: async () => {
      if (!copy.trim()) throw new Error('copy');
      if (!discount.trim()) throw new Error('discount');
      return createVetOffer({
        copy: copy.trim(), discount: discount.trim(),
        serviceType: serviceType || undefined,
        targetSpecies: species,
        targetCity: city.trim() || undefined,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      });
    },
    onSuccess: () => { toast.success('Oferta creada'); reset(); queryClient.invalidateQueries({ queryKey: ['vet-offers'] }); },
    onError: (e: any) => toast.error(e?.message === 'copy' ? 'Escribe el texto de la oferta' : e?.message === 'discount' ? 'Indica el descuento' : 'No se pudo crear'),
  });

  const toggleMut = useMutation({
    mutationFn: (id: string) => toggleVetOffer(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vet-offers'] }),
    onError: () => toast.error('No se pudo actualizar'),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteVetOffer(id),
    onSuccess: () => { toast.success('Oferta eliminada'); queryClient.invalidateQueries({ queryKey: ['vet-offers'] }); },
    onError: (e: any) => toast.error(e?.response?.data?.error === 'already_used' ? 'No se puede borrar: ya se usó' : 'No se pudo eliminar'),
  });

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ width: 38, height: 38, borderRadius: 11, background: MPL.gold100, color: MPL.goldDark, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Tag size={20} />
        </span>
        <div>
          <h3 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 20, margin: 0 }}>Mis ofertas de servicio</h3>
          <p style={{ color: MPL.faint, fontSize: 13, margin: 0 }}>Aparecen en el pasaporte de las mascotas que encajen con la segmentación.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <label style={{ display: 'grid', gap: 6, fontWeight: 800, fontSize: 14 }}>
            Texto de la oferta
            <input value={copy} onChange={e => setCopy(e.target.value)} style={inputStyle} placeholder="Ej. Primera revisión gratuita" />
          </label>
          <label style={{ display: 'grid', gap: 6, fontWeight: 800, fontSize: 14 }}>
            Descuento
            <input value={discount} onChange={e => setDiscount(e.target.value)} style={inputStyle} placeholder="20% / Gratis" />
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <label style={{ display: 'grid', gap: 6, fontWeight: 800, fontSize: 14 }}>
            Servicio
            <select value={serviceType} onChange={e => setServiceType(e.target.value)} style={inputStyle}>
              <option value="">Sin especificar</option>
              {SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6, fontWeight: 800, fontSize: 14 }}>
            Ciudad (opcional)
            <input value={city} onChange={e => setCity(e.target.value)} style={inputStyle} placeholder="Ej. Lugo" />
          </label>
          <label style={{ display: 'grid', gap: 6, fontWeight: 800, fontSize: 14 }}>
            Caduca (opcional)
            <input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} style={inputStyle} />
          </label>
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontWeight: 800, fontSize: 14 }}>Para especie (opcional)</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {SPECIES.map(s => {
              const active = species.includes(s.v);
              return (
                <button key={s.v} type="button"
                  onClick={() => setSpecies(active ? species.filter(x => x !== s.v) : [...species, s.v])}
                  style={{ padding: '7px 13px', borderRadius: 999, border: `1.5px solid ${active ? MPL.teal : MPL.border}`, background: active ? MPL.teal : '#fff', color: active ? '#fff' : MPL.ink, font: 'inherit', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
                  {s.l}
                </button>
              );
            })}
          </div>
        </div>
        <button type="button" onClick={() => createMut.mutate()} disabled={createMut.isPending}
          style={{ justifySelf: 'start', background: MPL.coral, color: '#fff', border: 0, borderRadius: 13, padding: '12px 20px', font: 'inherit', fontWeight: 800, cursor: 'pointer', opacity: createMut.isPending ? .7 : 1 }}>
          {createMut.isPending ? 'Creando…' : 'Crear oferta'}
        </button>
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ fontWeight: 800, fontSize: 13, color: MPL.muted, marginBottom: 8 }}>Ofertas activas</div>
        {offersQ.isLoading ? (
          <div style={{ color: MPL.faint }}>Cargando…</div>
        ) : offers.length === 0 ? (
          <div style={{ color: MPL.faint, fontSize: 14 }}>Aún no has creado ofertas.</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {offers.map(o => (
              <div key={o._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, border: `1px solid ${MPL.border}`, borderRadius: 12, padding: '11px 14px', opacity: o.active ? 1 : .6 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{o.copy} <span style={{ color: MPL.coralDark }}>· {o.discount}</span></div>
                  <div style={{ fontSize: 12.5, color: MPL.faint, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {o.serviceType && <span>{o.serviceType}</span>}
                    {o.targetSpecies.length > 0 && <span>· {o.targetSpecies.join(', ')}</span>}
                    {o.targetCity && <span>· {o.targetCity}</span>}
                    {o.expiresAt && <span>· caduca {new Date(o.expiresAt).toLocaleDateString()}</span>}
                    {!o.active && <span>· inactiva</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flex: 'none' }}>
                  <button type="button" onClick={() => toggleMut.mutate(o._id)} style={{ border: `1.5px solid ${MPL.border}`, background: '#fff', borderRadius: 10, padding: '7px 12px', font: 'inherit', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
                    {o.active ? 'Desactivar' : 'Activar'}
                  </button>
                  <button type="button" onClick={() => deleteMut.mutate(o._id)} aria-label="Eliminar" style={{ border: `1.5px solid ${MPL.border}`, background: '#fff', color: MPL.coralDark, borderRadius: 10, padding: '7px 10px', cursor: 'pointer' }}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
