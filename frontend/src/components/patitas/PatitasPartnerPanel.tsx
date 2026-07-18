import React, { Suspense, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Camera, CheckCircle2, X, UserCheck, Ticket, Store } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getMyPatitas, redeemPreview, redeemConfirm, identifyUser, earnVisit, registerSale, listPosKeys, createPosKey, revokePosKey, type EligibleCoupon, type PosKey, type RedeemPreview, type SaleItemInput } from '../../api/patitas';
import { listCoupons, applyCouponToCustomer } from '../../api/coupons';
import { getPartnerConnectStatus, createPartnerConnectLink, type ConnectStatus } from '../../api/connect';
import { getPartnerMetrics } from '../../api/metrics';
import PatitasHistory from './PatitasHistory';
import { MPL, MPL_FONT_DISPLAY, MPL_FONT_MONO } from '../../styles/mypetlive';

// Carga diferida: html5-qrcode (zxing) es pesado y solo lo usan los partners al escanear.
const QrScanner = React.lazy(() => import('./QrScanner'));

const card: React.CSSProperties = { background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 18, padding: 22 };
const input: React.CSSProperties = { border: `1.5px solid ${MPL.border}`, borderRadius: 12, padding: '11px 13px', font: 'inherit', boxSizing: 'border-box', background: '#fff' };

type WalletRef = { walletToken?: string; code?: string };

// Tarjeta de onboarding Stripe del partner.
function Metric({ value, label, note }: { value: React.ReactNode; label: string; note?: string }) {
  return (
    <div style={{ border: `1px solid ${MPL.border}`, borderRadius: 14, padding: '14px 16px' }}>
      <div style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 26, fontWeight: 800, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 13, color: MPL.muted, marginTop: 4 }}>{label}</div>
      {note && <div style={{ fontSize: 12, color: MPL.oliveDark, fontWeight: 700, marginTop: 2 }}>{note}</div>}
    </div>
  );
}

// Retorno visible del partner: lo que le aporta estar en MyPetLive (P2 gap analysis).
function PartnerMetrics() {
  const metricsQ = useQuery({ queryKey: ['partner-metrics'], queryFn: getPartnerMetrics, staleTime: 60_000 });
  const m = metricsQ.data;
  return (
    <div style={card}>
      <h3 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 18, margin: '0 0 4px' }}>Tu actividad en MyPetLive</h3>
      <p style={{ color: MPL.muted, fontSize: 13.5, margin: '0 0 14px' }}>Clientes, cupones y ventas generados a través de la plataforma.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
        <Metric
          value={metricsQ.isLoading ? '...' : m?.clientes.unicos ?? 0}
          label="clientes únicos"
        />
        <Metric
          value={metricsQ.isLoading ? '...' : m?.cupones.usados ?? 0}
          label="cupones usados"
          note={`${m?.cupones.usadosEsteMes ?? 0} este mes · ${m?.cupones.total ?? 0} creados`}
        />
        <Metric
          value={metricsQ.isLoading ? '...' : `${m?.ventas.totalEur ?? 0} €`}
          label={`ventas (${m?.ventas.numero ?? 0})`}
          note={`${m?.ventas.esteMesEur ?? 0} € este mes`}
        />
        <Metric
          value={metricsQ.isLoading ? '...' : m?.patitas.recibidas ?? 0}
          label="Patitas cobradas"
          note={`${m?.patitas.valorEur ?? 0} € recibidos`}
        />
      </div>
    </div>
  );
}

function PartnerPayout() {
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    getPartnerConnectStatus().then(setStatus).catch((e: any) => { if (e?.response?.status === 503) setUnavailable(true); }).finally(() => setLoading(false));
  }, []);

  const connect = async () => {
    setLinking(true);
    try {
      const { url } = await createPartnerConnectLink();
      window.location.href = url;
    } catch (e: any) {
      if (e?.response?.status === 503) { setUnavailable(true); toast.error('Los pagos aún no están disponibles'); }
      else toast.error('No se pudo iniciar la configuración');
      setLinking(false);
    }
  };

  const ready = status?.connected && status?.payouts_enabled;
  return (
    <div style={card}>
      <h3 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 18, margin: '0 0 4px' }}>Recibir pagos</h3>
      <p style={{ color: MPL.muted, fontSize: 13.5, margin: '0 0 14px' }}>Conecta tu cuenta para recibir el dinero de los canjes de Patitas que cobres.</p>
      {loading ? <div style={{ color: MPL.faint }}>Comprobando…</div> :
        unavailable ? <div style={{ background: MPL.gold100, color: MPL.goldDark, borderRadius: 12, padding: 14, fontSize: 13.5, fontWeight: 700 }}>Se activará muy pronto. Vuelve más adelante para conectar tu cuenta.</div> :
        ready ? <div style={{ background: MPL.olive100, color: MPL.oliveDark, borderRadius: 12, padding: 14, fontWeight: 800 }}>✓ Cuenta lista para recibir pagos.</div> :
        <button type="button" onClick={connect} disabled={linking} style={{ background: MPL.teal, color: '#fff', border: 0, borderRadius: 13, padding: '12px 18px', font: 'inherit', fontWeight: 800, cursor: 'pointer' }}>
          {linking ? 'Abriendo…' : status?.connected ? 'Continuar verificación' : 'Conectar cuenta de cobro'}
        </button>}
    </div>
  );
}

// Conexión del TPV del partner: claves API (una por caja, con etiqueta y
// revocación individual; modo test = sandbox sin efectos) para que su sistema
// de caja exporte las ventas y aplique cupones al escanear al cliente.
function PosIntegration() {
  const [keys, setKeys] = useState<PosKey[] | null>(null);
  const [newKey, setNewKey] = useState<{ key: string; label: string } | null>(null);
  const [label, setLabel] = useState('');
  const [testMode, setTestMode] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = () => listPosKeys().then(r => setKeys(r.keys)).catch(() => {});
  useEffect(() => { reload(); }, []);

  // Wizard "en 3 pasos": estado derivado de las claves. El semáforo del paso 3
  // se pone verde solo cuando la caja hace su primera llamada con la clave test.
  const testKey = keys?.find(k => k.mode === 'test');
  const tested = !!testKey?.lastUsedAt;
  const hasLive = !!keys?.some(k => k.mode === 'live');
  useEffect(() => {
    if (!testKey || tested) return;
    const t = setInterval(reload, 10000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testKey?.id, tested]);

  const create = async (payload: { label?: string; mode?: 'live' | 'test' }) => {
    setBusy(true);
    try {
      const r = await createPosKey(payload);
      setNewKey({ key: r.key, label: r.label });
      setLabel('');
      setTestMode(false);
      reload();
    } catch {
      toast.error('No se pudo generar la clave');
    } finally { setBusy(false); }
  };

  const generate = () => create({ label: label.trim() || undefined, mode: testMode ? 'test' : 'live' });

  const guideUrl = `${typeof window !== 'undefined' ? window.location.origin : 'https://mypetlive.es'}/developers/tpv`;
  const mailto = () => {
    const subject = encodeURIComponent('Conectar nuestro TPV con MyPetLive');
    const body = encodeURIComponent(
      `Hola,\n\nQueremos conectar nuestra caja con MyPetLive (registra ventas y aplica cupones al escanear al cliente).\n\n` +
      `Guía técnica (2 llamadas REST): ${guideUrl}\n\n` +
      (newKey ? `Clave de pruebas (sandbox, sin efectos reales):\n${newKey.key}\n\n` : `La clave de pruebas os la paso por un canal seguro.\n\n`) +
      `Gracias`,
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const revoke = async (k: PosKey) => {
    if (!window.confirm(`¿Revocar la clave "${k.label}"? La caja que la use dejará de funcionar al momento.`)) return;
    try {
      await revokePosKey(k.id);
      toast.success('Clave revocada');
      reload();
    } catch { toast.error('No se pudo revocar la clave'); }
  };

  const copyKey = async () => {
    if (!newKey) return;
    try { await navigator.clipboard.writeText(newKey.key); toast.success('Clave copiada'); }
    catch { window.prompt('Copia la clave:', newKey.key); }
  };

  return (
    <div style={card}>
      <h3 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 18, margin: '0 0 4px' }}>Conectar tu TPV</h3>
      <p style={{ color: MPL.muted, fontSize: 13.5, margin: '0 0 14px' }}>
        Opcional: si tu sistema de caja puede integrarse, las ventas se registran solas. Si no,
        usa el <strong>Modo Caja</strong> del menú — no necesitas nada más. Tú no tienes que hacer
        nada técnico: reenvía la guía a tu proveedor de TPV y él se encarga.
      </p>

      {/* Conexión guiada en 3 pasos: clave de pruebas → enviar guía → semáforo. */}
      <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', background: MPL.bg, borderRadius: 12, padding: '12px 14px' }}>
          <span style={{ fontWeight: 800, fontSize: 13.5, color: testKey ? MPL.oliveDark : MPL.ink }}>
            {testKey ? '✓' : '1.'} Crea la clave de pruebas
          </span>
          {!testKey && (
            <button type="button" onClick={() => create({ label: 'Integración (pruebas)', mode: 'test' })} disabled={busy || !keys} style={{ marginLeft: 'auto', background: MPL.teal, color: '#fff', border: 0, borderRadius: 11, padding: '9px 14px', font: 'inherit', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
              {busy ? '…' : 'Crear clave de pruebas'}
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', background: MPL.bg, borderRadius: 12, padding: '12px 14px' }}>
          <span style={{ fontWeight: 800, fontSize: 13.5 }}>2. Envía la guía a tu proveedor de TPV</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a href={guideUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 800, color: MPL.tealDark, alignSelf: 'center' }}>Ver guía</a>
            <button type="button" onClick={mailto} style={{ background: '#fff', border: `1.5px solid ${MPL.border}`, borderRadius: 11, padding: '9px 14px', font: 'inherit', fontWeight: 800, fontSize: 13, cursor: 'pointer', color: MPL.ink }}>
              Enviar por email
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', background: tested ? '#eef7ee' : MPL.bg, borderRadius: 12, padding: '12px 14px' }}>
          <span style={{ fontWeight: 800, fontSize: 13.5, color: tested ? MPL.oliveDark : MPL.ink }}>
            {tested ? '✓ ¡Tu caja ya está llamando!' : '3. Esperando la primera llamada de tu caja…'}
          </span>
          {!tested && testKey && <span style={{ fontSize: 12.5, color: MPL.faint }}>(se comprueba solo cada pocos segundos)</span>}
          {tested && !hasLive && (
            <button type="button" onClick={() => create({ label: 'Caja 1', mode: 'live' })} disabled={busy} style={{ marginLeft: 'auto', background: MPL.coral, color: '#fff', border: 0, borderRadius: 11, padding: '9px 14px', font: 'inherit', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
              Activar: crear la clave real
            </button>
          )}
        </div>
      </div>
      {newKey && (
        <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
          <div style={{ background: MPL.gold100, color: MPL.goldDark, borderRadius: 12, padding: 12, fontSize: 13, fontWeight: 700 }}>
            Clave "{newKey.label}" creada. Guárdala ahora: por seguridad no se volverá a mostrar.
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <code style={{ fontFamily: MPL_FONT_MONO, fontSize: 13, background: MPL.bg, borderRadius: 10, padding: '10px 12px', wordBreak: 'break-all' }}>{newKey.key}</code>
            <button type="button" onClick={copyKey} style={{ background: MPL.teal, color: '#fff', border: 0, borderRadius: 11, padding: '10px 16px', font: 'inherit', fontWeight: 800, cursor: 'pointer' }}>Copiar</button>
            <button type="button" onClick={() => setNewKey(null)} style={{ background: '#fff', color: MPL.ink, border: `1.5px solid ${MPL.border}`, borderRadius: 11, padding: '10px 16px', font: 'inherit', fontWeight: 800, cursor: 'pointer' }}>Hecho</button>
          </div>
        </div>
      )}
      {!!keys?.length && (
        <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
          {keys.map(k => (
            <div key={k.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: MPL.bg, borderRadius: 12, padding: '10px 12px' }}>
              <span style={{ fontWeight: 800, fontSize: 13.5 }}>{k.label}</span>
              {k.mode === 'test' && (
                <span style={{ fontSize: 11.5, fontWeight: 800, color: MPL.goldDark, background: MPL.gold100, borderRadius: 8, padding: '2px 8px' }}>PRUEBAS</span>
              )}
              <code style={{ fontFamily: MPL_FONT_MONO, fontSize: 12.5, color: MPL.muted }}>{k.prefix}…</code>
              <span style={{ fontSize: 12.5, color: MPL.muted, marginLeft: 'auto' }}>
                {k.lastUsedAt ? `Última llamada: ${new Date(k.lastUsedAt).toLocaleString()}` : 'Sin llamadas aún'}
              </span>
              <button type="button" onClick={() => revoke(k)} style={{ background: '#fff', color: '#b3261e', border: `1.5px solid ${MPL.border}`, borderRadius: 10, padding: '6px 12px', font: 'inherit', fontWeight: 800, fontSize: 12.5, cursor: 'pointer' }}>Revocar</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="Etiqueta (p. ej. Caja 1)"
          maxLength={60}
          style={{ border: `1.5px solid ${MPL.border}`, borderRadius: 11, padding: '10px 12px', font: 'inherit', fontSize: 13.5 }}
        />
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: MPL.muted, fontWeight: 700, cursor: 'pointer' }}>
          <input type="checkbox" checked={testMode} onChange={e => setTestMode(e.target.checked)} />
          Clave de pruebas
        </label>
        <button type="button" onClick={generate} disabled={busy || !keys} style={{ background: MPL.teal, color: '#fff', border: 0, borderRadius: 13, padding: '12px 18px', font: 'inherit', fontWeight: 800, cursor: 'pointer' }}>
          {busy ? '…' : 'Nueva clave del TPV'}
        </button>
      </div>
    </div>
  );
}

// Generación de Patitas a un cliente (identificar por QR/código → visita o cupón).
// Exportado: es también el corazón del Modo Caja (/caja), el alta sin TPV.
export function GeneratePatitas({ meId, onDone }: { meId: string; onDone: () => void }) {
  const [scanning, setScanning] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [customer, setCustomer] = useState<{ userId: string; name?: string; coupons?: EligibleCoupon[] } | null>(null);
  // Venta con ticket: importe + líneas opcionales (producto/cantidad/precio).
  const [saleAmount, setSaleAmount] = useState('');
  const [saleItems, setSaleItems] = useState<Array<{ name: string; qty: string; priceEur: string }>>([]);

  const couponsQ = useQuery({ queryKey: ['my-coupons'], queryFn: listCoupons });
  const myCoupons = (couponsQ.data?.items || []).filter(c => String(c.partnerId) === meId && !c.usedAt && c.active);

  const identify = async (ref: { userToken?: string; code?: string }) => {
    setBusy(true);
    try {
      const u = await identifyUser(ref);
      setCustomer({ userId: u.userId, name: u.name, coupons: u.coupons });
    } catch (e: any) {
      toast.error(e?.response?.data?.error === 'invalid_user_code' ? 'Código de cliente no válido o caducado' : 'No se pudo identificar al cliente');
    } finally { setBusy(false); }
  };

  const doVisit = async () => {
    if (!customer) return;
    setBusy(true);
    try {
      const r = await earnVisit(customer.userId);
      toast.success(`+${r.earned} 🐾 a ${customer.name || 'el cliente'}${r.autoDonated ? ' (auto-donadas a su protectora)' : ''}`);
      reset();
    } catch (e: any) {
      toast.error(e?.response?.data?.error === 'visit_already_rewarded' ? 'Esa visita ya se premió hoy' : 'No se pudo registrar la visita');
    } finally { setBusy(false); }
  };

  const applyCoupon = async (coupon: { _id: string; targetAnimalCode?: string | null; bonusPatitas?: number | null; title?: string; copy?: string; discount?: string }) => {
    if (!customer) return;
    setBusy(true);
    try {
      const r = await applyCouponToCustomer(coupon._id, customer.userId, coupon.targetAnimalCode || undefined);
      toast.success(`Cupón aplicado · +${r.earn?.earned ?? coupon.bonusPatitas ?? 0} 🐾 a ${customer.name || 'el cliente'}`);
      couponsQ.refetch();
      reset();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'No se pudo aplicar el cupón');
    } finally { setBusy(false); }
  };

  const doSale = async () => {
    if (!customer) return;
    const amount = Number(saleAmount);
    if (!Number.isFinite(amount) || amount <= 0) { toast.error('Introduce el importe del ticket'); return; }
    const items: SaleItemInput[] = saleItems
      .filter(i => i.name.trim())
      .map(i => ({
        name: i.name.trim(),
        ...(Number(i.qty) > 0 ? { qty: Number(i.qty) } : {}),
        ...(Number(i.priceEur) >= 0 && i.priceEur !== '' ? { priceEur: Number(i.priceEur) } : {}),
      }));
    setBusy(true);
    try {
      const r = await registerSale({ userId: customer.userId, amountEur: amount, items });
      toast.success(`Venta de ${amount.toFixed(2)} € registrada · +${r.patitasEarned} 🐾 a ${customer.name || 'el cliente'}${r.autoDonated ? ' (auto-donadas a su protectora)' : ''}`);
      reset();
    } catch (e: any) {
      toast.error(e?.response?.data?.error === 'invalid_amount' ? 'Importe no válido' : 'No se pudo registrar la venta');
    } finally { setBusy(false); }
  };

  const setItem = (idx: number, patch: Partial<{ name: string; qty: string; priceEur: string }>) =>
    setSaleItems(items => items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const reset = () => { setCustomer(null); setCode(''); setScanning(false); setSaleAmount(''); setSaleItems([]); onDone(); };

  return (
    <div style={card}>
      <h3 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 18, margin: '0 0 4px' }}>Registrar venta o visita de un cliente</h3>
      <p style={{ color: MPL.muted, fontSize: 13.5, margin: '0 0 14px' }}>Identifica al cliente por su QR o código y registra su compra (gana Patitas según el importe), una visita o un cupón.</p>

      {!customer ? (
        <div style={{ display: 'grid', gap: 14 }}>
          {scanning ? (
            <div style={{ display: 'grid', gap: 10, justifyItems: 'start' }}>
              <Suspense fallback={<div style={{ color: MPL.faint }}>Cargando cámara…</div>}>
                <QrScanner onResult={t => { setScanning(false); identify({ userToken: t }); }} onError={() => { setScanning(false); toast.error('No se pudo abrir la cámara'); }} />
              </Suspense>
              <button type="button" onClick={() => setScanning(false)} style={{ background: '#fff', border: `1.5px solid ${MPL.border}`, borderRadius: 11, padding: '8px 14px', font: 'inherit', fontWeight: 800, cursor: 'pointer' }}>Cancelar</button>
            </div>
          ) : (
            <button type="button" onClick={() => setScanning(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifySelf: 'start', background: MPL.teal, color: '#fff', border: 0, borderRadius: 13, padding: '12px 18px', font: 'inherit', fontWeight: 800, cursor: 'pointer' }}>
              <Camera size={18} /> Escanear QR del cliente
            </button>
          )}
          <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
            <label style={{ display: 'grid', gap: 6, fontWeight: 800, fontSize: 14 }}>
              Código del cliente
              <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="ABC123" style={{ ...input, width: 160, fontFamily: MPL_FONT_MONO, letterSpacing: 1 }} />
            </label>
            <button type="button" onClick={() => code.trim() && identify({ code: code.trim().toUpperCase() })} disabled={busy || !code.trim()} style={{ background: MPL.ink, color: '#fff', border: 0, borderRadius: 13, padding: '12px 18px', font: 'inherit', fontWeight: 800, cursor: 'pointer' }}>
              {busy ? '…' : 'Identificar'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: MPL.bg, borderRadius: 14, padding: 16 }}>
            <span style={{ width: 40, height: 40, borderRadius: 11, background: MPL.teal, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><UserCheck size={20} /></span>
            <div>
              <div style={{ fontSize: 12.5, color: MPL.faint, fontWeight: 800 }}>Cliente identificado</div>
              <div style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 20, fontWeight: 800 }}>{customer.name || 'Cliente'}</div>
            </div>
            <button type="button" onClick={reset} style={{ marginLeft: 'auto', background: 'none', border: 0, color: MPL.faint, cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>Cambiar</button>
          </div>

          <div style={{ display: 'grid', gap: 10, background: MPL.bg, borderRadius: 14, padding: 16 }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>Registrar venta</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
              <label style={{ display: 'grid', gap: 6, fontWeight: 800, fontSize: 13 }}>
                Importe del ticket (€)
                <input type="number" min={0} step="0.01" value={saleAmount} onChange={e => setSaleAmount(e.target.value)} placeholder="0.00" style={{ ...input, width: 140 }} />
              </label>
              <button type="button" onClick={doSale} disabled={busy || !saleAmount} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: MPL.coral, color: '#fff', border: 0, borderRadius: 13, padding: '12px 18px', font: 'inherit', fontWeight: 800, cursor: 'pointer' }}>
                {busy ? '…' : 'Registrar venta'}
              </button>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {saleItems.map((it, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input value={it.name} onChange={e => setItem(idx, { name: e.target.value })} placeholder="Producto (p. ej. pienso cachorro 3kg)" style={{ ...input, flex: 1, minWidth: 180, padding: '9px 11px' }} />
                  <input type="number" min={1} value={it.qty} onChange={e => setItem(idx, { qty: e.target.value })} placeholder="Cant." style={{ ...input, width: 70, padding: '9px 11px' }} />
                  <input type="number" min={0} step="0.01" value={it.priceEur} onChange={e => setItem(idx, { priceEur: e.target.value })} placeholder="€" style={{ ...input, width: 90, padding: '9px 11px' }} />
                  <button type="button" onClick={() => setSaleItems(items => items.filter((_, i) => i !== idx))} aria-label="Quitar línea" style={{ background: 'none', border: 0, color: MPL.faint, cursor: 'pointer' }}><X size={16} /></button>
                </div>
              ))}
              <button type="button" onClick={() => setSaleItems(items => [...items, { name: '', qty: '1', priceEur: '' }])} style={{ justifySelf: 'start', background: 'none', border: 0, color: MPL.tealDark, cursor: 'pointer', font: 'inherit', fontWeight: 800, fontSize: 13 }}>
                + Añadir línea del ticket (para ofertas personalizadas)
              </button>
            </div>
          </div>

          <button type="button" onClick={doVisit} disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifySelf: 'start', background: MPL.olive, color: '#fff', border: 0, borderRadius: 13, padding: '12px 18px', font: 'inherit', fontWeight: 800, cursor: 'pointer' }}>
            <Store size={17} /> Solo visita (sin compra)
          </button>

          <div>
            {/* Si identify trajo los cupones elegibles de ESTE cliente (targeting incluido),
                se enseñan esos; si no, todos los activos del partner (comportamiento anterior). */}
            {(() => {
              const applicable: Array<{ _id: string; title?: string; copy?: string; discount?: string; bonusPatitas?: number | null; targetAnimalCode?: string | null }> =
                customer.coupons ?? myCoupons;
              return (
                <>
                  <div style={{ fontSize: 13, fontWeight: 800, color: MPL.muted, marginBottom: 8 }}>
                    {customer.coupons ? 'Cupones de este cliente en tu establecimiento' : 'O aplicar uno de tus cupones'}
                  </div>
                  {applicable.length === 0 ? (
                    <div style={{ color: MPL.faint, fontSize: 13 }}>
                      {customer.coupons ? 'Este cliente no tiene cupones aplicables aquí.' : 'No tienes cupones activos.'}
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {applicable.map(c => (
                        <button key={c._id} type="button" onClick={() => applyCoupon(c)} disabled={busy} style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 12, padding: '11px 14px', font: 'inherit', cursor: 'pointer' }}>
                          <Ticket size={18} color={MPL.coralDark} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 800, fontSize: 14 }}>{c.title || c.copy}</div>
                            <div style={{ fontSize: 12, color: MPL.faint }}>{c.discount}{c.targetAnimalCode ? ` · ${c.targetAnimalCode}` : ''}</div>
                          </div>
                          <span style={{ fontWeight: 800, color: MPL.oliveDark }}>+{c.bonusPatitas ?? 0} 🐾</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PatitasPartnerPanel() {
  const { user } = useAuth();
  const meId = String(user?._id || '');
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [walletRef, setWalletRef] = useState<WalletRef | null>(null);
  const [preview, setPreview] = useState<RedeemPreview | null>(null);
  const [amountMode, setAmountMode] = useState<'all' | 'manual'>('all');
  const [manualAmount, setManualAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  const meQ = useQuery({ queryKey: ['patitas-me'], queryFn: getMyPatitas });

  const resolveWallet = async (ref: WalletRef) => {
    setBusy(true);
    try {
      const p = await redeemPreview(ref);
      setWalletRef(ref);
      setPreview(p);
    } catch (e: any) {
      toast.error(e?.response?.data?.error === 'invalid_wallet' ? 'QR/código no válido o caducado' : 'No se pudo leer la wallet');
    } finally {
      setBusy(false);
    }
  };

  const onScan = (text: string) => { setScanning(false); resolveWallet({ walletToken: text }); };
  const submitCode = () => { if (code.trim()) resolveWallet({ code: code.trim().toUpperCase() }); };

  const confirm = async () => {
    if (!walletRef) return;
    const amount = amountMode === 'all' ? 'all' : Number(manualAmount);
    if (amountMode === 'manual' && (!Number.isFinite(amount as number) || (amount as number) <= 0)) { toast.error('Importe no válido'); return; }
    setBusy(true);
    try {
      const res = await redeemConfirm({ ...walletRef, amount });
      setResult(res);
      setPreview(null); setWalletRef(null); setCode('');
      qc.invalidateQueries({ queryKey: ['patitas-me'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.error === 'insufficient_patitas' ? 'La protectora no tiene saldo suficiente' : 'No se pudo completar el canje');
    } finally {
      setBusy(false);
    }
  };

  const value = preview ? preview.patitaValueEur : meQ.data?.patitaValueEur ?? 0.1;
  const amount = amountMode === 'all' ? preview?.available ?? 0 : Number(manualAmount) || 0;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <PartnerMetrics />

      <PartnerPayout />

      <GeneratePatitas meId={meId} onDone={() => qc.invalidateQueries({ queryKey: ['patitas-me'] })} />

      <PosIntegration />

      <div style={card}>
        <h3 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 18, margin: '0 0 4px' }}>Cobrar con Patitas</h3>
        <p style={{ color: MPL.muted, fontSize: 13.5, margin: '0 0 14px' }}>Escanea el QR de la protectora o introduce su código de canje.</p>

        {!preview && (
          <div style={{ display: 'grid', gap: 14 }}>
            {scanning ? (
              <div style={{ display: 'grid', gap: 10, justifyItems: 'start' }}>
                <Suspense fallback={<div style={{ color: MPL.faint }}>Cargando cámara…</div>}>
                  <QrScanner onResult={onScan} onError={() => { setScanning(false); toast.error('No se pudo abrir la cámara'); }} />
                </Suspense>
                <button type="button" onClick={() => setScanning(false)} style={{ background: '#fff', border: `1.5px solid ${MPL.border}`, borderRadius: 11, padding: '8px 14px', font: 'inherit', fontWeight: 800, cursor: 'pointer' }}>Cancelar</button>
              </div>
            ) : (
              <button type="button" onClick={() => setScanning(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifySelf: 'start', background: MPL.teal, color: '#fff', border: 0, borderRadius: 13, padding: '12px 18px', font: 'inherit', fontWeight: 800, cursor: 'pointer' }}>
                <Camera size={18} /> Escanear QR
              </button>
            )}
            <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
              <label style={{ display: 'grid', gap: 6, fontWeight: 800, fontSize: 14 }}>
                Código manual
                <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="ABC123" style={{ ...input, width: 160, fontFamily: MPL_FONT_MONO, letterSpacing: 1 }} />
              </label>
              <button type="button" onClick={submitCode} disabled={busy || !code.trim()} style={{ background: MPL.ink, color: '#fff', border: 0, borderRadius: 13, padding: '12px 18px', font: 'inherit', fontWeight: 800, cursor: 'pointer' }}>
                {busy ? '…' : 'Buscar'}
              </button>
            </div>
          </div>
        )}

        {preview && (
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ background: MPL.bg, borderRadius: 14, padding: 16 }}>
              <div style={{ fontSize: 13, color: MPL.faint, fontWeight: 800 }}>Protectora</div>
              <div style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 22, fontWeight: 800 }}>{preview.shelter.name || 'Protectora'}</div>
              <div style={{ fontSize: 14, color: MPL.muted, marginTop: 4 }}>Disponible: <strong>{preview.available} 🐾</strong> (≈ {(preview.available * value).toFixed(2)} €)</div>
            </div>

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontWeight: 800 }}>
                <input type="radio" checked={amountMode === 'all'} onChange={() => setAmountMode('all')} /> Canje automático (todo)
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontWeight: 800 }}>
                <input type="radio" checked={amountMode === 'manual'} onChange={() => setAmountMode('manual')} /> Importe manual
              </label>
              {amountMode === 'manual' && (
                <input type="number" min={1} max={preview.available} value={manualAmount} onChange={e => setManualAmount(e.target.value)} placeholder="Patitas" style={{ ...input, width: 130 }} />
              )}
            </div>

            <div style={{ background: MPL.teal, color: '#fff', borderRadius: 14, padding: 18 }}>
              <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.8)', fontWeight: 800 }}>Resumen de canje</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6 }}>
                <span style={{ fontSize: 16, fontWeight: 800 }}>{amount} 🐾</span>
                <span style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 30, fontWeight: 800 }}>{(amount * value).toFixed(2)} €</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={confirm} disabled={busy || amount <= 0} style={{ background: MPL.coral, color: '#fff', border: 0, borderRadius: 13, padding: '13px 22px', font: 'inherit', fontWeight: 800, cursor: 'pointer' }}>
                {busy ? 'Procesando…' : 'Confirmar canje'}
              </button>
              <button type="button" onClick={() => { setPreview(null); setWalletRef(null); }} style={{ background: '#fff', border: `1.5px solid ${MPL.border}`, borderRadius: 13, padding: '13px 18px', font: 'inherit', fontWeight: 800, cursor: 'pointer' }}>Cancelar</button>
            </div>
          </div>
        )}
      </div>

      <div style={card}>
        <h3 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 18, margin: '0 0 14px' }}>Cobros recientes</h3>
        <PatitasHistory items={meQ.data?.history || []} meId={meId} emptyText="Todavía no has cobrado ningún canje." />
      </div>

      {result && (
        <div onClick={() => setResult(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(31,55,40,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 20, padding: 28, maxWidth: 380, width: '100%', textAlign: 'center', position: 'relative' }}>
            <button onClick={() => setResult(null)} style={{ position: 'absolute', top: 14, right: 14, background: 'none', border: 0, cursor: 'pointer', color: MPL.faint }}><X size={20} /></button>
            <CheckCircle2 size={48} color={MPL.oliveDark} style={{ margin: '0 auto' }} />
            <h3 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 24, margin: '12px 0 4px' }}>Canje confirmado</h3>
            <div style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 40, fontWeight: 800, color: MPL.oliveDark }}>{result.valueEur.toFixed(2)} €</div>
            <div style={{ color: MPL.muted, fontSize: 14 }}>{result.patitas} 🐾 de {result.shelter?.name || 'la protectora'}</div>
            <div style={{ background: MPL.bg, borderRadius: 12, padding: 12, margin: '16px 0 6px' }}>
              <div style={{ fontSize: 12, color: MPL.faint, fontWeight: 800 }}>Código de confirmación</div>
              <div style={{ fontFamily: MPL_FONT_MONO, fontSize: 22, fontWeight: 800, color: MPL.ink }}>{result.code}</div>
            </div>
            <div style={{ fontSize: 13, color: result.payoutStatus === 'paid' ? MPL.oliveDark : MPL.goldDark, fontWeight: 700 }}>
              {result.payoutStatus === 'paid' ? '✓ Pago enviado a tu cuenta' : 'Pago pendiente de abono'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
