// Los topes y porcentajes del marketplace se leen del entorno al importar el
// módulo, así que se prueban recargándolo con el entorno puesto.
//
// El caso que importa es el de la variable **declarada pero vacía**: el compose
// del VPS las pasa como "${VAR}", y si el .env no la trae llega como ''. Con la
// comprobación ingenua (`Number('') === 0` es finito y >= 0) la comisión y los
// portes se iban a cero en silencio, y el tope por pedido a 0 € habría
// bloqueado todas las compras sin un solo error en el log.

const KEYS = [
  'MARKETPLACE_COMMISSION_PCT',
  'MARKETPLACE_MARKUP_PCT',
  'MARKETPLACE_SHIPPING_EUR',
  'MARKETPLACE_FREE_SHIPPING_FROM_EUR',
  'MARKETPLACE_ORDER_MAX_EUR',
];

const original: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of KEYS) {
    original[key] = process.env[key];
    delete process.env[key];
  }
  jest.resetModules();
});

afterEach(() => {
  for (const key of KEYS) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

function load() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../utils/marketplace');
}

describe('Configuración por entorno', () => {
  it('sin nada definido usa los valores por defecto', () => {
    const mod = load();
    expect(mod.MARKETPLACE_COMMISSION_PCT).toBe(8);
    expect(mod.MARKETPLACE_MARKUP_PCT).toBe(15);
    expect(mod.PLATFORM_SHIPPING_EUR).toBe(4.9);
    expect(mod.PLATFORM_FREE_SHIPPING_FROM_EUR).toBe(49);
    expect(mod.ORDER_MAX_EUR).toBe(1500);
  });

  it('una variable declarada pero VACÍA no pone el valor a cero', () => {
    for (const key of KEYS) process.env[key] = '';
    const mod = load();

    expect(mod.MARKETPLACE_COMMISSION_PCT).toBe(8);
    expect(mod.PLATFORM_SHIPPING_EUR).toBe(4.9);
    // El peor de todos: un tope de 0 € rechaza cualquier pedido.
    expect(mod.ORDER_MAX_EUR).toBe(1500);
  });

  it('tampoco con espacios en blanco ni con basura', () => {
    process.env.MARKETPLACE_COMMISSION_PCT = '   ';
    process.env.MARKETPLACE_ORDER_MAX_EUR = 'mucho';
    const mod = load();
    expect(mod.MARKETPLACE_COMMISSION_PCT).toBe(8);
    expect(mod.ORDER_MAX_EUR).toBe(1500);
  });

  it('respeta el cero cuando se pide de verdad', () => {
    // Es un valor legítimo: portes gratis, o comisión 0% en una promoción.
    process.env.MARKETPLACE_SHIPPING_EUR = '0';
    process.env.MARKETPLACE_COMMISSION_PCT = '0';
    const mod = load();
    expect(mod.PLATFORM_SHIPPING_EUR).toBe(0);
    expect(mod.MARKETPLACE_COMMISSION_PCT).toBe(0);
  });

  it('lee los valores que sí se configuran', () => {
    process.env.MARKETPLACE_COMMISSION_PCT = '12.5';
    process.env.MARKETPLACE_ORDER_MAX_EUR = '900';
    const mod = load();
    expect(mod.MARKETPLACE_COMMISSION_PCT).toBe(12.5);
    expect(mod.ORDER_MAX_EUR).toBe(900);
  });

  it('un número negativo no se acepta: se cae al defecto', () => {
    process.env.MARKETPLACE_COMMISSION_PCT = '-5';
    expect(load().MARKETPLACE_COMMISSION_PCT).toBe(8);
  });
});
