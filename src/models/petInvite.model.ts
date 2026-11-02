import { Schema, model, Types } from 'mongoose';

// Invitación para compartir una mascota de familia con otra persona.
//
// La manda el dueño (`Animal.ownerId`) a un correo. El enlace lleva un token
// que solo viaja en ese correo; aquí se guarda su sha256, como el de
// recuperación de contraseña, para que una copia de la base de datos no sirva
// para colarse en la ficha de nadie. Un solo uso y caduca a los 14 días.
//
// Al aceptar no se exige que la cuenta tenga el mismo correo: mucha gente entra
// con Apple (correo de relé) o con otra cuenta que la del día a día. El dueño ve
// siempre quién entró y puede quitarle el acceso.
export type PetInviteStatus = 'pending' | 'accepted' | 'declined' | 'revoked';

export interface PetInviteDoc {
  _id: Types.ObjectId;
  animalId: Types.ObjectId;
  invitedBy: Types.ObjectId;
  email: string;
  tokenHash: string;
  status: PetInviteStatus;
  expiresAt: Date;
  acceptedBy?: Types.ObjectId;
  respondedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const PET_INVITE_DAYS = 14;

const petInviteSchema = new Schema<PetInviteDoc>(
  {
    animalId: { type: Schema.Types.ObjectId, ref: 'Animal', required: true, index: true },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    status: { type: String, enum: ['pending', 'accepted', 'declined', 'revoked'], default: 'pending', index: true },
    expiresAt: { type: Date, required: true },
    acceptedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    respondedAt: { type: Date },
  },
  { timestamps: true },
);

export const PetInvite = model<PetInviteDoc>('PetInvite', petInviteSchema);
