import { Schema, model } from 'mongoose';

export type TenantProDocType = 'nomina' | 'contrato' | 'renta' | 'autonomo' | 'otros';

const tenantProDocSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['nomina', 'contrato', 'renta', 'autonomo', 'otros'],
      required: true,
    },
    url: {
      type: String,
      required(this: { archivedAt?: Date }) {
        return !this.archivedAt;
      },
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    uploadedAt: { type: Date, default: Date.now },
    reviewedAt: { type: Date },
    reviewer: { type: Schema.Types.ObjectId, ref: 'User' },
    hash: { type: String },
    archivedAt: { type: Date },
  },
  { _id: true },
);

const tenantProDocAuditSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['nomina', 'contrato', 'renta', 'autonomo', 'otros'],
      required: true,
    },
    hash: { type: String },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
    },
    reviewedAt: { type: Date },
    archivedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const tenantProSchema = new Schema(
  {
    isActive: { type: Boolean, default: false },
    maxRent: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['none', 'pending', 'verified', 'rejected'],
      default: 'none',
    },
    docs: { type: [tenantProDocSchema], default: [] },
    auditTrail: { type: [tenantProDocAuditSchema], default: [] },
    consentAccepted: { type: Boolean, default: false },
    consentTextVersion: { type: String },
    consentAcceptedAt: { type: Date },
    lastDecisionAt: { type: Date },
  },
  { _id: false },
);

/**
 * Schema for users. The role distinguishes between landlords and tenants.
 * Passwords are stored hashed in the passwordHash field.
 */
const userSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    // Passwords are stored hashed; see controllers/auth.controller.ts
    passwordHash: { type: String, required: true },
    /**
     * Role assigned to the user. Supported values include:
     *  - tenant: standard renter of properties.
     *  - landlord: owner of one or more properties.
     *  - admin: platform administrator with elevated privileges.
     *
     * Additional roles can be added here as the system evolves, e.g. for
     * community‐level managers when offering a SaaS model to governments.
     */
    role: {
      type: String,
      enum: ['landlord', 'tenant', 'admin', 'pro', 'store', 'vet'],
      required: true,
    },
    ratingAvg: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    // Optional Stripe identifiers for payments
    stripeAccountId: { type: String },
    stripeCustomerId: { type: String },
    stripeCustomerPending: { type: Boolean, default: false },
    stripeCustomerRetries: { type: Number, default: 0 },
    termsAcceptedAt: { type: Date },
    privacyAcceptedAt: { type: Date },
    legalVersion: { type: String },
    termsVersionAccepted: { type: String },
    privacyVersionAccepted: { type: String },
    patitas: { type: Number, default: 0 },
    // Password reset support
    resetToken: { type: String },
    resetTokenExp: { type: Date },
  },
  { timestamps: true },
);

/**
 * Dirección postal reutilizable (adoptantes, protectoras y tiendas).
 */
const addressSchema = new Schema(
  {
    street: { type: String, trim: true },
    city: { type: String, trim: true },
    postalCode: { type: String, trim: true },
    region: { type: String, trim: true },
    country: { type: String, trim: true, default: 'España' },
  },
  { _id: false },
);

/**
 * Perfil enriquecido del usuario. Los campos relevantes dependen del rol:
 *  - adoptante (tenant): firstName/lastName, age, occupation, housingType, address, avatar, bio.
 *  - protectora (landlord): orgName, website, address, avatar/logo, bio (el cobro de donaciones
 *    se gestiona vía Stripe Connect — stripeAccountId — no se guarda IBAN en claro).
 *  - tienda/vet (store/vet): orgName, address, avatar/logo.
 */
const profileSchema = new Schema(
  {
    avatarUrl: { type: String, trim: true },
    phone: { type: String, trim: true },
    bio: { type: String, trim: true, maxlength: 1000 },
    // Persona
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    age: { type: Number, min: 0, max: 120 },
    occupation: { type: String, trim: true },
    housingType: { type: String, enum: ['casa', 'piso'] },
    // Organización
    orgName: { type: String, trim: true },
    website: { type: String, trim: true },
    // Común
    address: { type: addressSchema, default: () => ({}) },
    // Auto-donación de Patitas: reenvía automáticamente las Patitas generadas a una protectora.
    autoDonate: {
      type: new Schema(
        {
          enabled: { type: Boolean, default: false },
          shelterId: { type: Schema.Types.ObjectId, ref: 'User' },
        },
        { _id: false },
      ),
      default: () => ({ enabled: false }),
    },
  },
  { _id: false },
);

userSchema.add({ tenantPro: { type: tenantProSchema, default: () => ({}) } });
userSchema.add({ profile: { type: profileSchema, default: () => ({}) } });

userSchema.index({ 'tenantPro.status': 1, 'tenantPro.maxRent': -1 });

export const User = model('User', userSchema);
