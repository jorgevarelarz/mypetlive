import { Schema, model } from 'mongoose';

// QR de canje de Patitas ya usado (AUD-2, FAC-115). El token del QR de la
// protectora es un JWT de 10 minutos: sin esto, una tienda o un veterinario que
// lo escaneó podía repetir el canje con él hasta vaciar el saldo, y cada canje
// lanza una transferencia real de Stripe. Ahora cada token vale una vez: su `jti`
// se apunta aquí (como _id) en la misma transacción que el débito.
// El `jti` es el _id: único siempre, sin depender de que exista un índice aparte
// (en una base recién creada el índice único aún no está y dejaba pasar duplicados).
const walletUseSchema = new Schema(
  {
    _id: { type: String, required: true },
    shelterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    usedAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);
// El token caduca a los 10 minutos: pasado un día ya no hace falta recordarlo.
walletUseSchema.index({ usedAt: 1 }, { expireAfterSeconds: 86_400 });

export const WalletUse = model('WalletUse', walletUseSchema);
