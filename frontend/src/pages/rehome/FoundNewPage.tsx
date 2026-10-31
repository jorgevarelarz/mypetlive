import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { X } from 'lucide-react';
import { createFound, foundError } from '../../api/found';
import { uploadImage } from '../../api/uploads';
import { MPL, MPL_FONT_DISPLAY } from '../../styles/mypetlive';
import { toAbsoluteUrl } from '../../utils/media';

const SPECIES = [
  { value: 'cat', label: 'Gato' }, { value: 'dog', label: 'Perro' }, { value: 'rabbit', label: 'Conejo' },
  { value: 'bird', label: 'Ave' }, { value: 'ferret', label: 'Hurón' }, { value: 'other', label: 'Otro' },
];
const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: `1.5px solid ${MPL.border}`, borderRadius: 12, padding: '11px 12px', font: 'inherit', fontSize: 16, background: '#fff', color: MPL.ink };
const label: React.CSSProperties = { display: 'grid', gap: 6, fontSize: 13.5, fontWeight: 800, color: MPL.ink };

/** Camino «Lo he encontrado»: la ficha pública para que su familia lo vea. */
export default function FoundNewPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [species, setSpecies] = useState('cat');
  const [sex, setSex] = useState('');
  const [name, setName] = useState('');
  const [approxAge, setApproxAge] = useState('');
  const [foundAt, setFoundAt] = useState(new Date().toLocaleDateString('en-CA'));
  const [foundPlace, setFoundPlace] = useState('');
  const [city, setCity] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const f of Array.from(files).slice(0, 8 - images.length)) {
        const { url } = await uploadImage(f);
        setImages(prev => [...prev, new URL(url, window.location.href).pathname]);
      }
    } catch { toast.error('No se pudo subir alguna foto'); } finally { setUploading(false); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const f = await createFound({ species, sex: sex || undefined, name, approxAge, foundAt: new Date(`${foundAt}T12:00`).toISOString(), foundPlace, city, description, images });
      await qc.invalidateQueries({ queryKey: ['found-mine'] });
      toast.success('Publicado. Ahora, los pasos para buscar a su familia.');
      nav(`/buscar-casa/encontrado/${f._id}`);
    } catch (err) { toast.error(foundError(err, 'No se pudo publicar')); } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 14, padding: 'clamp(14px, 4vw, 24px)', maxWidth: 560 }}>
      <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 28, fontWeight: 800, margin: 0 }}>He encontrado un animal</h1>
      <div style={{ background: MPL.gold100, color: MPL.goldDark, borderRadius: 14, padding: '12px 14px', fontSize: 14 }}>
        Primero buscamos a su familia: publicamos esta ficha en «Animales encontrados» para que pueda verla. No puedes darlo tú: no está a tu nombre. Si nadie aparece, una protectora lo registra y lo da en adopción, y tú puedes quedártelo si quieres.
      </div>
      <div style={label}>
        Fotos (se ven bien la cara y el cuerpo entero)
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {images.map(src => (
            <div key={src} style={{ position: 'relative', width: 78, height: 78, borderRadius: 12, overflow: 'hidden', background: MPL.panel }}>
              <img src={toAbsoluteUrl(src)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <button type="button" aria-label="Quitar foto" onClick={() => setImages(prev => prev.filter(x => x !== src))}
                style={{ position: 'absolute', top: 4, right: 4, width: 24, height: 24, padding: 0, borderRadius: 999, border: 0, background: 'rgba(255,255,255,.9)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><X size={14} /></button>
            </div>
          ))}
          {images.length < 8 && (
            <label style={{ width: 78, height: 78, borderRadius: 12, border: `1.5px dashed ${MPL.border}`, display: 'grid', placeItems: 'center', cursor: 'pointer', color: MPL.muted, fontSize: uploading ? 12 : 26, background: '#fff' }}>
              {uploading ? 'Subiendo…' : '+'}
              <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => { void addPhotos(e.target.files); e.target.value = ''; }} />
            </label>
          )}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label style={label}>Especie<select value={species} onChange={e => setSpecies(e.target.value)} style={field}>{SPECIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
        <label style={label}>Sexo<select value={sex} onChange={e => setSex(e.target.value)} style={field}><option value="">No lo sé</option><option value="female">Hembra</option><option value="male">Macho</option></select></label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label style={label}>Nombre que le pones (opcional)<input maxLength={60} value={name} onChange={e => setName(e.target.value)} style={field} /></label>
        <label style={label}>Edad aproximada<input maxLength={40} value={approxAge} onChange={e => setApproxAge(e.target.value)} style={field} placeholder="3 meses" /></label>
      </div>
      <label style={label}>Cuándo lo encontraste<input type="date" required max={new Date().toLocaleDateString('en-CA')} value={foundAt} onChange={e => setFoundAt(e.target.value)} style={field} /></label>
      <label style={label}>Dónde lo encontraste<input required maxLength={160} value={foundPlace} onChange={e => setFoundPlace(e.target.value)} style={field} placeholder="Playa de Santa Cristina, junto al paseo" /></label>
      <label style={label}>Municipio<input maxLength={80} value={city} onChange={e => setCity(e.target.value)} style={field} placeholder="Oleiros" /></label>
      <label style={label}>Señas que ayuden a reconocerlo
        <textarea rows={4} maxLength={2000} value={description} onChange={e => setDescription(e.target.value)} style={{ ...field, resize: 'vertical' }} placeholder="Collar, manchas, cómo se comporta… Guarda algún detalle para preguntar a quien diga que es suyo." />
      </label>
      <button type="submit" disabled={busy || uploading || !images.length || !foundPlace.trim()}
        style={{ background: MPL.coral, color: '#fff', border: 0, borderRadius: 14, padding: '14px 18px', font: 'inherit', fontWeight: 800, fontSize: 16, cursor: 'pointer', opacity: busy || !images.length || !foundPlace.trim() ? .55 : 1 }}>
        {busy ? 'Publicando…' : 'Publicar como encontrado'}
      </button>
    </form>
  );
}
