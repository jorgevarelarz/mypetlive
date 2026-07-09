import { Schema, model } from 'mongoose';

const verificationDocumentSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['nif', 'association_registry', 'animal_protection_registry', 'zoological_center', 'other'],
      required: true,
    },
    fileUrl: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
    reviewedAt: { type: Date },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
  },
  { _id: false },
);

/**
 * Verification status for a user. Each user can only have one verification
 * record which tracks the documents submitted and the review status.
 */
const verificationSchema = new Schema(
  {
    userId: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ['unverified', 'pending', 'verified', 'rejected'],
      default: 'unverified',
    },
    verificationLevel: {
      type: String,
      enum: ['none', 'association', 'animal_protection_entity', 'authorized_center'],
      default: 'none',
    },
    legalName: { type: String, trim: true },
    nif: { type: String, trim: true, uppercase: true },
    associationRegistryNumber: { type: String, trim: true },
    animalProtectionRegistryNumber: { type: String, trim: true },
    zoologicalCenterNumber: { type: String, trim: true },
    autonomousCommunity: { type: String, trim: true },
    representativeName: { type: String, trim: true },
    representativeRole: { type: String, trim: true },
    method: { type: String, enum: ['dni', 'nie', 'passport'] },
    files: {
      idFrontUrl: String,
      idBackUrl: String,
      selfieUrl: String,
    },
    documents: { type: [verificationDocumentSchema], default: [] },
    notes: { type: String },
  },
  { timestamps: true },
);

export const Verification = model('Verification', verificationSchema);
