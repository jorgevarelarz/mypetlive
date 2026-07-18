import { Schema, model, Document, Types } from 'mongoose';

// Definición canónica de los primeros pasos tras adoptar. El plan persiste solo
// qué tareas están hechas; títulos, descripciones y enlaces viven aquí para
// poder ajustarlos sin migrar datos.
export interface WelcomeTaskDef {
  key: string;
  title: string;
  description: string;
  /** Ruta del frontend a la que lleva la tarea (relativa, sin dominio). */
  link?: string;
}

export const WELCOME_TASKS: WelcomeTaskDef[] = [
  {
    key: 'home_prep',
    title: 'Prepara tu casa para su llegada',
    description: 'Un rincón tranquilo con cama, comedero y bebedero le ayudará a adaptarse los primeros días.',
  },
  {
    key: 'vet_visit',
    title: 'Agenda la primera visita al veterinario',
    description: 'Una revisión inicial en los primeros 15 días confirma que todo va bien y abre su historial clínico.',
    link: '/vets',
  },
  {
    key: 'daily_care',
    title: 'Activa el cuidado diario',
    description: 'Registra comida y arena en su ficha para llevar el día a día sin olvidos.',
    link: '/pets',
  },
  {
    key: 'passport',
    title: 'Explora y comparte su pasaporte digital',
    description: 'Su código único guarda procedencia, salud y ofertas; compártelo con quien cuide de él.',
  },
  {
    key: 'offers',
    title: 'Revisa tus ofertas de bienvenida',
    description: 'Partners de MyPetLive tienen descuentos pensados para recién adoptados como el tuyo.',
    link: '/coupons',
  },
];

export const WELCOME_TASK_KEYS = WELCOME_TASKS.map(t => t.key);

interface IWelcomeTaskState {
  key: string;
  doneAt?: Date;
}

export interface IWelcomePlan extends Document {
  animalId: Types.ObjectId;
  ownerId: Types.ObjectId;
  adoptionId?: Types.ObjectId;
  activatedAt: Date;
  tasks: IWelcomeTaskState[];
  reminderSentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const taskStateSchema = new Schema<IWelcomeTaskState>(
  {
    key: { type: String, required: true },
    doneAt: { type: Date },
  },
  { _id: false },
);

const schema = new Schema<IWelcomePlan>(
  {
    animalId: { type: Schema.Types.ObjectId, ref: 'Animal', required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    adoptionId: { type: Schema.Types.ObjectId, ref: 'Adoption' },
    activatedAt: { type: Date, default: () => new Date() },
    tasks: { type: [taskStateSchema], default: [] },
    // Empujón único a los N días si quedan pasos pendientes (jobs/reminders).
    reminderSentAt: { type: Date },
  },
  { timestamps: true },
);

// Un plan por mascota y dueño (si el animal cambiara de dueño, arranca plan nuevo).
schema.index({ animalId: 1, ownerId: 1 }, { unique: true });

export const WelcomePlan = model<IWelcomePlan>('WelcomePlan', schema);
