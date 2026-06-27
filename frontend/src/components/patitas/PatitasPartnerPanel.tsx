import React, { Suspense, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Camera, CheckCircle2, X, UserCheck, Ticket, Store } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getMyPatitas, redeemPreview, redeemConfirm, identifyUser, earnVisit, type RedeemPreview } from '../../api/patitas';
import { listCoupons, applyCouponToCustomer, type Coupon } from '../../api/coupons';
import { getPartnerConnectStatus, createPartnerConnectLink, type ConnectStatus } from '../../api/connect';
import PatitasHistory from './PatitasHistory';
import { MPL, MPL_FONT_DISPLAY, MPL_FONT_MONO } from '../../styles/mypetlive';

// Carga diferida: html5-qrcode (zxing) es pesado y solo lo usan los partners al escanear.
const QrScanner = React.lazy(() => import('./QrScanner'));

const card: React.CSSProperties = { background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 18, padding: 22 };
const input: React.CSSProperties = { border: `1.5px solid ${MPL.border}`, borderRadius: 12, padding: '11px 13px', font: 'inherit', boxSizing: 'border-box', background: '#fff' };

type WalletRef = { walletToken?: string; code?: string };

// Tarjeta de onboarding Stripe del partner.
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

// Generación de Patitas a un cliente (identificar por QR/código → visita o cupón).
function GeneratePatitas({ meId, onDone }: { meId: string; onDone: () => void }) {
  const [scanning, setScanning] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [customer, setCustomer] = useState<{ userId: string; name?: string } | null>(null);

  const couponsQ = useQuery({ queryKey: ['my-coupons'], queryFn: listCoupons });
  const myCoupons = (couponsQ.data?.items || []).filter(c => String(c.partnerId) === meId && !c.usedAt && c.active);

  const identify = async (ref: { userToken?: string; code?: string }) => {
    setBusy(true);
    try {
      const u = await identifyUser(ref);
      setCustomer({ userId: u.userId, name: u.name });
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

  const applyCoupon = async (coupon: Coupon) => {
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

  const reset = () => { setCustomer(null); setCode(''); setScanning(false); onDone(); };

  return (
    <div style={card}>
      <h3 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 18, margin: '0 0 4px' }}>Generar Patitas a un cliente</h3>
      <p style={{ color: MPL.muted, fontSize: 13.5, margin: '0 0 14px' }}>Identifica al cliente por su QR o código y súmale Patitas por su visita o al usar un cupón.</p>

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

          <button type="button" onClick={doVisit} disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifySelf: 'start', background: MPL.olive, color: '#fff', border: 0, borderRadius: 13, padding: '12px 18px', font: 'inherit', fontWeight: 800, cursor: 'pointer' }}>
            <Store size={17} /> Registrar visita
          </button>

          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: MPL.muted, marginBottom: 8 }}>O aplicar uno de tus cupones</div>
            {myCoupons.length === 0 ? (
              <div style={{ color: MPL.faint, fontSize: 13 }}>No tienes cupones activos.</div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {myCoupons.map(c => (
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
      <PartnerPayout />

      <GeneratePatitas meId={meId} onDone={() => qc.invalidateQueries({ queryKey: ['patitas-me'] })} />

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
