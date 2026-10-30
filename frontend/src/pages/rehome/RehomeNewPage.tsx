import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { X } from 'lucide-react';
import { createRehomeListing, rehomeError } from '../../api/rehome';
import { uploadImage } from '../../api/uploads';
import { MPL, MPL_FONT_DISPLAY } from '../../styles/mypetlive';
import { toAbsoluteUrl } from '../../utils/media';

const SPECIES = [
  { value: 'cat', label: 'Gato' }, { value: 'dog', label: 'Perro' }, { value: 'ferret', label: 'Hurón' },
  { value: 'rabbit', label: 'Conejo' }, { value: 'bird', label: 'Ave' }, { value: 'other', label: 'Otro' },
];

const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: `1.5px solid ${MPL.border}`, borderRadius: 12, padding: '11px 12px', font: 'inherit', fontSize: 16, background: '#fff', color: MPL.ink };
const label: React.CSSProperties = { display: 'grid', gap: 6, fontSize: 13.5, fontWeight: 800, color: MPL.ink };

/** Publicar un animal propio para cederlo (camino «Es mío»). */
export default function RehomeNewPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [name, setName] = useState('');
  const [species, setSpecies] = useState('cat');
  const [sex, setSex] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [microchip, setMicrochip] = useState('');
  const [city, setCity] = useState('');
  const [description, setDescription] = useState('');
  const [declaration, setDeclaration] = useState(false);
  const [busy, setBusy] = useState(false);
  const digits = microchip.replace(/\D/g, '');

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const f of Array.from(files).slice(0, 8 - images.length)) {
        const { url } = await uploadImage(f);
        const path = new URL(url, window.location.href).pathname;
        setImages(prev => [...prev, path]);
      }
    } catch {
      toast.error('No se pudo subir alguna foto');
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const created = await createRehomeListing({ name, species, sex: sex || undefined, birthDate: birthDate || undefined, microchip: digits, city, description, images, declaration });
      toast.success(`${name} ya está publicado`);
      await qc.invalidateQueries({ queryKey: ['rehome-mine'] });
      nav(`/animals/${created._id}`);
    } catch (err) {
      toast.error(rehomeError(err, 'No se pudo publicar'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 14, padding: 'clamp(14px, 4vw, 24px)', maxWidth: 560 }}>
      <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 28, fontWeight: 800, margin: 0 }}>Ceder un animal</h1>
      <div style={{ background: MPL.olive100, color: MPL.oliveDark, borderRadius: 14, padding: '12px 14px', fontSize: 14, display: 'grid', gap: 3 }}>
        <strong>Para cederlo, la ley pide:</strong>
        <span>✓ Que tenga microchip y esté registrado a tu nombre.</span>
        <span>✓ Si es perro, gato o hurón, al menos 8 semanas.</span>
        <span>✓ Que sea gratis. Lo firmáis en un contrato que te damos hecho.</span>
      </div>

      <div style={label}>
        Fotos
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {images.map(src => (
            <div key={src} style={{ position: 'relative', width: 78, height: 78, borderRadius: 12, overflow: 'hidden', background: MPL.panel }}>
              <img src={toAbsoluteUrl(src)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <button type="button" aria-label="Quitar foto" onClick={() => setImages(prev => prev.filter(x => x !== src))}
                style={{ position: 'absolute', top: 4, right: 4, width: 24, height: 24, padding: 0, borderRadius: 999, border: 0, background: 'rgba(255,255,255,.9)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                <X size={14} />
              </button>
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

      <label style={label}>Nombre<input required maxLength={60} value={name} onChange={e => setName(e.target.value)} style={field} placeholder="Nube" /></label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label style={label}>Especie
          <select value={species} onChange={e => setSpecies(e.target.value)} style={field}>
            {SPECIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <label style={label}>Sexo
          <select value={sex} onChange={e => setSex(e.target.value)} style={field}>
            <option value="">Sin indicar</option><option value="female">Hembra</option><option value="male">Macho</option>
          </select>
        </label>
      </div>
      <label style={label}>Fecha de nacimiento (aproximada si no la sabes)
        <input type="date" max={new Date().toLocaleDateString('en-CA')} required={['dog', 'cat', 'ferret'].includes(species)} value={birthDate} onChange={e => setBirthDate(e.target.value)} style={field} />
      </label>
      <label style={label}>Número de microchip
        <input inputMode="numeric" required value={microchip} onChange={e => setMicrochip(e.target.value)} style={field} placeholder="15 cifras" />
        {microchip && digits.length !== 15 && <span style={{ fontWeight: 600, color: MPL.coralDark, fontSize: 13 }}>Lleva {digits.length} de 15 cifras.</span>}
      </label>
      <label style={label}>Dónde está<input maxLength={80} value={city} onChange={e => setCity(e.target.value)} style={field} placeholder="Oleiros" /></label>
      <label style={label}>Cómo es
        <textarea rows={4} maxLength={2000} value={description} onChange={e => setDescription(e.target.value)} style={{ ...field, resize: 'vertical' }} placeholder="Carácter, si usa arenero, qué come, si se lleva bien con otros animales…" />
      </label>
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, cursor: 'pointer' }}>
        <input type="checkbox" checked={declaration} onChange={e => setDeclaration(e.target.checked)} style={{ width: 20, height: 20, marginTop: 2, accentColor: MPL.teal }} />
        <span>Declaro que el animal está registrado a mi nombre con ese microchip y que no cobro nada por él.</span>
      </label>
      <button type="submit" disabled={busy || uploading || !declaration || digits.length !== 15 || !images.length}
        style={{ background: MPL.coral, color: '#fff', border: 0, borderRadius: 14, padding: '14px 18px', font: 'inherit', fontWeight: 800, fontSize: 16, cursor: 'pointer', opacity: busy || !declaration || digits.length !== 15 || !images.length ? .55 : 1 }}>
        {busy ? 'Publicando…' : name ? `Publicar a ${name}` : 'Publicar'}
      </button>
    </form>
  );
}
