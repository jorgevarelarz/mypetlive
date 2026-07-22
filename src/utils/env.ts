// El despliegue real corre con NODE_ENV=development a propósito (mocks y
// proveedores simulados), así que NODE_ENV no sirve para saber si estamos en
// producción. APP_ENV=production es la señal explícita del compose del VPS:
// cualquier bypass de desarrollo debe comprobar isProduction(), no NODE_ENV.
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production';
}
