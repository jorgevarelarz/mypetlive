// Asegura un perfil de App Store para BUNDLE_ID firmado con el certificado DIST_CERT_ID
// (API de App Store Connect) y lo instala en el runner. Sin dependencias: JWT ES256 con node:crypto.
// Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH, BUNDLE_ID, DIST_CERT_ID, PROFILE_NAME
import { createPrivateKey, sign } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";

const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH, BUNDLE_ID, DIST_CERT_ID, PROFILE_NAME } = process.env;
const b64 = (x) => Buffer.from(typeof x === "string" ? x : JSON.stringify(x)).toString("base64url");

function token() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "ES256", kid: ASC_KEY_ID, typ: "JWT" });
  const body = b64({ iss: ASC_ISSUER_ID, aud: "appstoreconnect-v1", iat: now, exp: now + 600 });
  const sig = sign("sha256", Buffer.from(`${head}.${body}`), { key: createPrivateKey(readFileSync(ASC_KEY_PATH)), dsaEncoding: "ieee-p1363" });
  return `${head}.${body}.${sig.toString("base64url")}`;
}

async function api(method, path, data) {
  const r = await fetch(`https://api.appstoreconnect.apple.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${token()}`, "content-type": "application/json" },
    body: data ? JSON.stringify({ data }) : undefined,
  });
  if (r.status === 204) return null;
  const j = await r.json();
  if (!r.ok) throw new Error(`${method} ${path}: ${JSON.stringify(j.errors)}`);
  return j;
}

const bundle = (await api("GET", `/bundleIds?filter[identifier]=${BUNDLE_ID}`)).data.find((b) => b.attributes.identifier === BUNDLE_ID);
if (!bundle) throw new Error(`No existe el App ID ${BUNDLE_ID} en developer.apple.com`);

const existing = (await api("GET", `/bundleIds/${bundle.id}/profiles?limit=50`)).data;
let profile = null;
for (const p of existing.filter((p) => p.attributes.name === PROFILE_NAME)) {
  const certs = (await api("GET", `/profiles/${p.id}/certificates`)).data.map((c) => c.id);
  // Un perfil anterior a activar las notificaciones no las lleva: se rehace
  const conPush = Buffer.from(p.attributes.profileContent ?? "", "base64").toString("latin1").includes("aps-environment");
  if (p.attributes.profileState === "ACTIVE" && certs.includes(DIST_CERT_ID) && conPush) profile = p;
  else await api("DELETE", `/profiles/${p.id}`);
}
if (!profile) {
  profile = (
    await api("POST", "/profiles", {
      type: "profiles",
      attributes: { name: PROFILE_NAME, profileType: "IOS_APP_STORE" },
      relationships: {
        bundleId: { data: { type: "bundleIds", id: bundle.id } },
        certificates: { data: [{ type: "certificates", id: DIST_CERT_ID }] },
      },
    })
  ).data;
  console.log(`Perfil creado: ${PROFILE_NAME}`);
} else console.log(`Perfil existente: ${PROFILE_NAME}`);

const dir = `${homedir()}/Library/MobileDevice/Provisioning Profiles`;
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/${profile.attributes.uuid}.mobileprovision`, Buffer.from(profile.attributes.profileContent, "base64"));
console.log(`Instalado ${profile.attributes.uuid}`);
