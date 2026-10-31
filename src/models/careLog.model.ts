import { Schema, model, Document, Types } from 'mongoose';

// Registro del cuidado diario.
//
// Antes esto no existía: marcar comida escribía `animal.lastFeeding = new Date()`
// pisando el valor anterior, así que dos comidas en un día eran una, no se sabía
// quién la había puesto y no había dónde guardar un detalle. Con voluntarios
// turnándose en una protectora eso es justo lo que hace falta saber.
//
// El animal conserva `lastFeeding`/`lastLitterChange`/`lastWalk` como caché para
// que las tarjetas y la home sigan resolviéndose con una sola lectura; la verdad
// está aquí.

export type CareType = 'feed' | 'litter' | 'walk';

/** Intensidad del paseo. El valor se guarda en clave; la etiqueta vive en el front. */
export const WALK_KINDS = ['suave', 'largo', 'corriendo', 'senderismo'] as const;
export type WalkKind = (typeof WALK_KINDS)[number];

export interface ICareLog extends Document {
  animalId: Types.ObjectId;
  type: CareType;
  actorId?: Types.ObjectId;
  /** Nombre de quien lo marcó, congelado en el momento: el registro no debe cambiar si esa persona se renombra o se borra. */
  actorName?: string;
  /** Comida: hasta dos productos. */
  foods?: string[];
  /** Arena: tipo usado. */
  litterType?: string;
  /** Paseo. */
  walk?: {
    kind?: WalkKind;
    minutes?: number;
    distanceKm?: number;
    place?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const walkSchema = new Schema(
  {
    kind: { type: String, enum: WALK_KINDS },
    // Topes de cordura, no de negocio: un paseo de 40 h o de 300 km es un dedazo,
    // y sin tope el resumen semanal queda inservible para siempre.
    minutes: { type: Number, min: 1, max: 1440 },
    distanceKm: { type: Number, min: 0, max: 100 },
    place: { type: String, trim: true, maxlength: 120 },
  },
  { _id: false },
);

const schema = new Schema<ICareLog>(
  {
    animalId: { type: Schema.Types.ObjectId, ref: 'Animal', required: true, index: true },
    type: { type: String, enum: ['feed', 'litter', 'walk'], required: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User' },
    actorName: { type: String, trim: true, maxlength: 120 },
    foods: { type: [{ type: String, trim: true, maxlength: 80 }], default: undefined },
    litterType: { type: String, trim: true, maxlength: 80 },
    walk: { type: walkSchema },
  },
  { timestamps: true },
);

// El resumen de la ficha siempre pregunta lo mismo: lo de este animal, lo más
// reciente primero.
schema.index({ animalId: 1, createdAt: -1 });

export const CareLog = model<ICareLog>('CareLog', schema);
