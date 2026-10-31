import { Schema, model } from 'mongoose';

// 'terms' y 'privacy' son los únicos que se aceptan; 'legal-notice' y 'cookies'
// son informativos y se sirven para enlazarlos desde el pie de página.
export type LegalSlug = 'terms' | 'privacy' | 'tenant-pro-consent' | 'legal-notice' | 'cookies';

const legalDocumentSchema = new Schema(
  {
    slug: {
      type: String,
      enum: ['terms', 'privacy', 'tenant-pro-consent', 'legal-notice', 'cookies'],
      required: true,
    },
    version: { type: String, required: true },
    content: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

legalDocumentSchema.index({ slug: 1, version: -1 }, { unique: true });

export const LegalDocument = model('LegalDocument', legalDocumentSchema);
