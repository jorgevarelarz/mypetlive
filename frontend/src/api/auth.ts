import { api as axios } from "../api/client";

export type UserAddress = {
  street?: string;
  city?: string;
  postalCode?: string;
  region?: string;
  country?: string;
};

export type UserProfile = {
  avatarUrl?: string;
  phone?: string;
  bio?: string;
  firstName?: string;
  lastName?: string;
  age?: number;
  occupation?: string;
  housingType?: "casa" | "piso";
  orgName?: string;
  website?: string;
  address?: UserAddress;
  vet?: VetProfile;
  itemCatalog?: ItemCatalogEntry[];
};

export type ItemCatalogEntry = {
  name: string;
  priceEur?: number;
};

export type VetServiceItem = {
  name: string;
  priceEur?: number;
  pricingType: "fijo" | "variable";
};

export type VetProfile = {
  licenseNumber?: string;
  specialties?: string[];
  services?: string[];
  serviceCatalog?: VetServiceItem[];
  schedule?: string;
  emergency24h?: boolean;
};

export type User = {
  _id: string;
  email: string;
  name?: string;
  role: "tenant" | "landlord" | "pro" | "admin" | "store" | "vet";
  isVerified?: boolean;
  profile?: UserProfile;
  tenantPro?: {
    status?: string;
    maxRent?: number;
    consentAccepted?: boolean;
    lastDecisionAt?: string;
  };
  token: string;
};

export async function login(email: string, password: string): Promise<User> {
  const { data } = await axios.post("/api/auth/login", { email, password });
  const user: User = { ...data.user, token: data.token };
  localStorage.setItem("user", JSON.stringify(user));
  axios.defaults.headers.common["Authorization"] = `Bearer ${user.token}`;
  return user;
}

// acceptLegal: la casilla «Acepto…» del formulario; el servidor guarda la
// aceptación de los textos vigentes en el mismo alta.
export async function register(name: string, email: string, password: string, acceptLegal = false) {
  await axios.post("/api/auth/register", { name, email, password, acceptLegal });
}

export type SocialProvider = "google" | "apple";

/**
 * Entra (o se da de alta) con el ID token que ha devuelto Google o Apple.
 * El backend responde igual que /login, así que la sesión se guarda idéntica.
 */
export async function socialLogin(
  provider: SocialProvider,
  idToken: string,
  name?: string,
): Promise<User> {
  // acceptLegal: los botones llevan al lado «Al continuar aceptas los términos
  // y la política de privacidad»; el servidor lo graba como la casilla del registro.
  const { data } = await axios.post(`/api/auth/oauth/${provider}`, { idToken, name, acceptLegal: true });
  const user: User = { ...data.user, token: data.token };
  localStorage.setItem("user", JSON.stringify(user));
  axios.defaults.headers.common["Authorization"] = `Bearer ${user.token}`;
  return user;
}

export function logout() {
  localStorage.removeItem("user");
  delete axios.defaults.headers.common["Authorization"];
}

export function getStoredUser(): User | null {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
}

export function bootstrapAuthHeader() {
  const u = getStoredUser();
  if (u?.token) axios.defaults.headers.common["Authorization"] = `Bearer ${u.token}`;
}

export async function requestPasswordReset(email: string) {
  await axios.post(`/api/auth/request-reset`, { email });
}

export async function resetPassword(token: string, password: string) {
  await axios.post(`/api/auth/reset`, { token, password });
}

export type DeletionBlocker =
  | "open_vet_appointments" | "locked_patitas" | "patitas_balance" | "pending_payouts"
  | "open_orders_as_seller" | "open_orders_as_buyer" | "open_adoptions_as_shelter" | "admin_account";

export async function getDeletionCheck(): Promise<{ canDelete: boolean; blockers: DeletionBlocker[]; confirmWith: "password" | "email" }> {
  const { data } = await axios.get("/api/auth/account/deletion-check");
  return data;
}

export async function deleteMyAccount(body: { password?: string; confirmEmail?: string }) {
  const { data } = await axios.post("/api/auth/account/delete", body);
  return data as { ok: true };
}
