import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Plus, Ticket } from 'lucide-react';
import { createMyCoupon, listMyCoupons, updateMyCoupon, type Coupon } from '../../api/coupons';
import { MPL, MPL_FONT_DISPLAY } from '../../styles/mypetlive';

// Cupones del partner.
//
// Hasta ahora crearlos era solo de admin, así que una tienda dependía de que
// alguien se los diera de alta a mano. Aquí los crea ella, siempre a su nombre:
// el servidor ignora el partnerId del body y usa el del token.

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 11px',
  borderRadius: 10,
  border: `1px solid ${MPL.border}`,
  background: MPL.card,
  color: MPL.ink,
};

// Espejo de COUPON_BONUS_MAX_PATITAS (backend, utils/limits.ts). Solo para que
// el input no deje teclear un imposible; quien manda es el servidor.
const BONUS_MAX = 200;

const SAVE_ERRORS: Record<string, string> = {
  missing_fields: 'El cupón necesita al menos título y descuento.',
  invalid_bonus: 'Las Patitas de regalo no pueden ser negativas.',
  expiration_in_past: 'Esa fecha de caducidad ya pasó.',
  invalid_expiration: 'La fecha de caducidad no es válida.',
  invalid_animal_code: 'El código del animal no tiene el formato LUNA-715.',
  coupon_already_used: 'Ese cupón ya lo canjeó un cliente: no se puede editar.',
  coupon_not_found: 'Ese cupón ya no existe.',
  copy_required: 'El título no puede quedar vacío.',
  discount_required: 'El descuento no puede quedar vacío.',
};

type FormState = {
  id?: string;
  title: string;
  description: string;
  discount: string;
  bonusPatitas: string;
  targetAnimalCode: string;
  expiresAt: string;
  active: boolean;
};

const emptyForm = (): FormState => ({
  title: '',
  description: '',
  discount: '',
  bonusPatitas: '',
  targetAnimalCode: '',
  expiresAt: '',
  active: true,
});

/** Un cupón se gasta con el primer cliente que lo canjea, así que hay 3 estados. */
function couponState(coupon: Coupon): { label: string; bg: string; fg: string } {
  if (coupon.usedAt) return { label: 'Canjeado', bg: MPL.border, fg: MPL.muted };
  if (coupon.expiresAt && new Date(coupon.expiresAt) <= new Date()) {
    return { label: 'Caducado', bg: MPL.border, fg: MPL.muted };
  }
  if (!coupon.active) return { label: 'Pausado', bg: MPL.gold100, fg: MPL.goldDark };
  return { label: 'Activo', bg: MPL.olive100, fg: MPL.oliveDark };
}

const asDateInput = (value?: string | null) => (value ? String(value).slice(0, 10) : '');

export default function PartnerCouponsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState<FormState | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['coupons-mine'],
    queryFn: listMyCoupons,
  });
  const coupons = data?.items || [];

  const onSaveError = (error: any) => {
    const body = error?.response?.data;
    if (body?.error === 'bonus_too_large') {
      toast.error(`El máximo son ${body.max} Patitas de regalo por cupón.`);
      return;
    }
    toast.error(SAVE_ERRORS[body?.error] || 'No hemos podido guardar el cupón');
  };

  const save = useMutation({
    mutationFn: (state: FormState) => {
      const payload = {
        title: state.title.trim(),
        description: state.description.trim() || undefined,
        discount: state.discount.trim(),
        bonusPatitas: state.bonusPatitas === '' ? 0 : Number(state.bonusPatitas),
        targetAnimalCode: state.targetAnimalCode.trim() || null,
        expiresAt: state.expiresAt || null,
        active: state.active,
      };
      return state.id ? updateMyCoupon(state.id, payload) : createMyCoupon(payload);
    },
    onSuccess: async () => {
      toast.success('Cupón guardado');
      setForm(null);
      await queryClient.invalidateQueries({ queryKey: ['coupons-mine'] });
      // El catálogo público lo muestra al momento: que no se quede desfasado.
      await queryClient.invalidateQueries({ queryKey: ['coupons'] });
    },
    onError: onSaveError,
  });

  const edit = (coupon: Coupon) =>
    setForm({
      id: coupon._id,
      title: coupon.title || coupon.copy || '',
      description: coupon.description || '',
      discount: coupon.discount || '',
      bonusPatitas: coupon.bonusPatitas === null || coupon.bonusPatitas === undefined ? '' : String(coupon.bonusPatitas),
      targetAnimalCode: coupon.targetAnimalCode || '',
      expiresAt: asDateInput(coupon.expiresAt),
      active: coupon.active,
    });

  const togglePause = useMutation({
    mutationFn: (coupon: Coupon) => updateMyCoupon(coupon._id, { active: !coupon.active }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['coupons-mine'] });
      await queryClient.invalidateQueries({ queryKey: ['coupons'] });
    },
    onError: onSaveError,
  });

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 820, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span
          style={{
            width: 44,
            height: 44,
            borderRadius: 13,
            background: MPL.teal,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 'none',
          }}
        >
          <Ticket size={22} />
        </span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 25, fontWeight: 800, margin: 0 }}>Mis cupones</h1>
          <p style={{ color: MPL.muted, fontSize: 13.5, margin: 0 }}>
            Las ofertas que publicas en el catálogo. Se canjean en <strong>Caja</strong>, escaneando el
            código del cliente.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setForm(emptyForm())}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            borderRadius: 12,
            border: 'none',
            background: MPL.coral,
            color: '#fff',
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          <Plus size={18} /> Nuevo cupón
        </button>
      </header>

      <div
        style={{
          background: MPL.gold100,
          border: `1px solid ${MPL.gold}`,
          borderRadius: 14,
          padding: 14,
          fontSize: 13,
          color: MPL.ink,
        }}
      >
        <strong>Cada cupón se canjea una sola vez.</strong> En cuanto un cliente lo usa en Caja queda
        marcado como canjeado y desaparece del catálogo. Si quieres una oferta permanente, ve creando
        cupones nuevos.
      </div>

      {form && (
        <form
          onSubmit={event => {
            event.preventDefault();
            save.mutate(form);
          }}
          style={{
            background: MPL.card,
            border: `1px solid ${MPL.border}`,
            borderRadius: 14,
            padding: 14,
            display: 'grid',
            gap: 10,
          }}
        >
          <strong style={{ fontSize: 15 }}>{form.id ? 'Editar cupón' : 'Nuevo cupón'}</strong>

          <input
            required
            placeholder="Título (ej. Pack bienvenida adoptante)"
            aria-label="Título del cupón"
            value={form.title}
            onChange={event => setForm({ ...form, title: event.target.value })}
            style={inputStyle}
          />
          <input
            required
            placeholder="Descuento (ej. 20% en accesorios)"
            aria-label="Descuento"
            value={form.discount}
            onChange={event => setForm({ ...form, discount: event.target.value })}
            style={inputStyle}
          />
          <textarea
            placeholder="Descripción (opcional)"
            aria-label="Descripción"
            rows={2}
            value={form.description}
            onChange={event => setForm({ ...form, description: event.target.value })}
            style={inputStyle}
          />

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <label style={{ display: 'grid', gap: 4, fontSize: 12.5, flex: '1 1 180px' }}>
              Patitas de regalo (máx. {BONUS_MAX})
              <input
                type="number"
                min={0}
                max={BONUS_MAX}
                step={1}
                placeholder="0"
                value={form.bonusPatitas}
                onChange={event => setForm({ ...form, bonusPatitas: event.target.value })}
                style={inputStyle}
              />
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 12.5, flex: '1 1 180px' }}>
              Caduca el (opcional)
              <input
                type="date"
                value={form.expiresAt}
                onChange={event => setForm({ ...form, expiresAt: event.target.value })}
                style={inputStyle}
              />
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 12.5, flex: '1 1 180px' }}>
              Solo para un animal (opcional)
              <input
                placeholder="LUNA-715"
                value={form.targetAnimalCode}
                onChange={event => setForm({ ...form, targetAnimalCode: event.target.value.toUpperCase() })}
                style={inputStyle}
              />
            </label>
          </div>

          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5 }}>
            <input
              type="checkbox"
              checked={form.active}
              onChange={event => setForm({ ...form, active: event.target.checked })}
            />
            Visible en el catálogo
          </label>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="submit"
              disabled={save.isPending}
              style={{
                padding: '10px 16px',
                borderRadius: 11,
                border: 'none',
                background: MPL.teal,
                color: '#fff',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {save.isPending ? 'Guardando…' : 'Guardar cupón'}
            </button>
            <button
              type="button"
              onClick={() => setForm(null)}
              style={{
                padding: '10px 16px',
                borderRadius: 11,
                border: `1px solid ${MPL.border}`,
                background: MPL.card,
                color: MPL.muted,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div style={{ color: MPL.faint }}>Cargando tus cupones…</div>
      ) : isError ? (
        <div style={{ background: MPL.card, border: `1px solid ${MPL.border}`, borderRadius: 14, padding: 16 }}>
          <p style={{ margin: '0 0 10px' }}>No hemos podido cargar tus cupones.</p>
          <button
            type="button"
            onClick={() => refetch()}
            style={{ padding: '8px 14px', borderRadius: 10, border: 'none', background: MPL.teal, color: '#fff', fontWeight: 800, cursor: 'pointer' }}
          >
            Reintentar
          </button>
        </div>
      ) : coupons.length === 0 ? (
        <div style={{ background: MPL.card, border: `1px solid ${MPL.border}`, borderRadius: 14, padding: 16, color: MPL.muted }}>
          Todavía no has publicado ningún cupón.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {coupons.map(coupon => {
            const state = couponState(coupon);
            const spent = Boolean(coupon.usedAt);
            return (
              <div
                key={coupon._id}
                style={{
                  background: MPL.card,
                  border: `1px solid ${MPL.border}`,
                  borderRadius: 14,
                  padding: 14,
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  opacity: spent ? 0.65 : 1,
                }}
              >
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 15 }}>{coupon.title || coupon.copy}</strong>
                    <span
                      style={{
                        background: state.bg,
                        color: state.fg,
                        borderRadius: 999,
                        padding: '2px 10px',
                        fontSize: 11.5,
                        fontWeight: 800,
                      }}
                    >
                      {state.label}
                    </span>
                  </div>
                  <div style={{ color: MPL.tealDark, fontSize: 13.5, fontWeight: 700, marginTop: 2 }}>
                    {coupon.discount}
                  </div>
                  {coupon.description && (
                    <div style={{ color: MPL.muted, fontSize: 13, marginTop: 4 }}>{coupon.description}</div>
                  )}
                  <div style={{ color: MPL.faint, fontSize: 12.5, marginTop: 6 }}>
                    {coupon.bonusPatitas ? `+${coupon.bonusPatitas} 🐾 al cliente` : 'Sin Patitas de regalo'}
                    {coupon.expiresAt ? ` · caduca el ${new Date(coupon.expiresAt).toLocaleDateString('es-ES')}` : ''}
                    {coupon.targetAnimalCode ? ` · solo ${coupon.targetAnimalCode}` : ''}
                  </div>
                </div>
                {!spent && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => edit(coupon)}
                      style={{ padding: '8px 12px', borderRadius: 10, border: `1px solid ${MPL.border}`, background: MPL.card, fontWeight: 700, cursor: 'pointer', color: MPL.ink }}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      disabled={togglePause.isPending}
                      onClick={() => togglePause.mutate(coupon)}
                      style={{ padding: '8px 12px', borderRadius: 10, border: `1px solid ${MPL.border}`, background: MPL.card, fontWeight: 700, cursor: 'pointer', color: MPL.muted }}
                    >
                      {coupon.active ? 'Pausar' : 'Reactivar'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
