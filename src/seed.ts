import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User } from './models/user.model';
import { Animal } from './models/animal.model';
import { Coupon } from './models/coupon.model';
import { PatitaLog } from './models/patitaLog.model';

async function main() {
  const mongoUrl = process.env.MONGO_URL || process.env.MONGO_URI || 'mongodb://localhost:27017/rental-app';
  await mongoose.connect(mongoUrl);

  const password = 'password';

  // Protectora (role landlord para compatibilidad con permisos)
  const protectoras = await Promise.all([
    (async () => {
      const email = 'protectora1@example.com';
      const existing = await User.findOne({ email });
      if (existing) return existing;
      const passwordHash = await bcrypt.hash(password, 10);
      return User.create({
        name: 'Protectora Esperanza',
        email,
        passwordHash,
        role: 'landlord',
        patitas: 120,
      });
    })(),
    (async () => {
      const email = 'protectora2@example.com';
      const existing = await User.findOne({ email });
      if (existing) return existing;
      const passwordHash = await bcrypt.hash(password, 10);
      return User.create({
        name: 'Refugio Patitas',
        email,
        passwordHash,
        role: 'landlord',
        patitas: 75,
      });
    })(),
  ]);

  // Profesionales
  const vet = await (async () => {
    const email = 'vet@example.com';
    const found = await User.findOne({ email });
    if (found) return found;
    const passwordHash = await bcrypt.hash(password, 10);
    return User.create({ name: 'Clínica VetPlus', email, passwordHash, role: 'vet' });
  })();

  const store = await (async () => {
    const email = 'store@example.com';
    const found = await User.findOne({ email });
    if (found) return found;
    const passwordHash = await bcrypt.hash(password, 10);
    return User.create({ name: 'Tienda Animalia', email, passwordHash, role: 'store' });
  })();

  // Adoptante / dueño de mascotas (tenant)
  const adopter = await (async () => {
    const email = 'adoptante@example.com';
    const found = await User.findOne({ email });
    if (found) return found;
    const passwordHash = await bcrypt.hash(password, 10);
    return User.create({ name: 'Adoptante Demo', email, passwordHash, role: 'tenant' });
  })();

  // Animales de ejemplo
  const guardians = protectoras.filter(Boolean);
  const shelterA = guardians[0];
  const shelterB = guardians[1] || guardians[0];

  const demoAnimals = [
    {
      name: 'Luna',
      species: 'Perro',
      breed: 'Mestiza',
      sex: 'female',
      age: '2 años',
      size: 'medium',
      status: 'publicado',
      images: ['https://images.unsplash.com/photo-1518717758536-85ae29035b6d?w=800'],
      shelter: shelterA.id,
      createdByRole: 'protectora',
    },
    {
      name: 'Max',
      species: 'Perro',
      breed: 'Labrador',
      sex: 'male',
      age: '1 año',
      size: 'large',
      status: 'publicado',
      images: ['https://images.unsplash.com/photo-1507146426996-ef05306b995a?w=800'],
      shelter: shelterA.id,
      createdByRole: 'protectora',
    },
    {
      name: 'Mia',
      species: 'Gato',
      breed: 'Europeo',
      sex: 'female',
      age: '6 meses',
      size: 'small',
      status: 'publicado',
      images: ['https://images.unsplash.com/photo-1518791841217-8f162f1e1131?w=800'],
      shelter: shelterB.id,
      createdByRole: 'protectora',
    },
    {
      name: 'Rocky',
      species: 'Perro',
      breed: 'Bulldog',
      sex: 'male',
      age: '3 años',
      size: 'medium',
      status: 'publicado',
      images: ['https://images.unsplash.com/photo-1507149833265-60c372daea22?w=800'],
      shelter: shelterB.id,
      createdByRole: 'protectora',
    },
  ] as any[];

  const animals = await Animal.insertMany(demoAnimals);

  // Ofertas (cupones) para aplicar en tiendas/vets
  const coupons = await Coupon.insertMany([
    {
      partnerId: store.id,
      partnerType: 'store',
      copy: '10% en piensos solidarios',
      title: 'Pienso solidario',
      discount: '10% en compra',
      bonusPatitas: 8,
      active: true,
    },
    {
      partnerId: vet.id,
      partnerType: 'vet',
      copy: 'Consulta solidaria',
      title: 'Consulta solidaria',
      discount: '15€ en consulta',
      bonusPatitas: 12,
      targetAnimalCode: animals[0]?.code,
      active: true,
    },
  ]);

  // Log de Patitas pendiente (para ver en la pantalla de partners)
  await PatitaLog.create({
    shelterId: shelterA.id,
    userId: store.id,
    partnerId: store.id,
    animalId: animals[0]?._id,
    amount: 25,
    source: 'store',
    concept: 'Compra de cama y juguetes',
  });

  await PatitaLog.create({
    shelterId: shelterB.id,
    userId: vet.id,
    partnerId: vet.id,
    animalId: animals[2]?._id,
    amount: 40,
    source: 'vet',
    concept: 'Vacunación y desparasitación',
    couponId: coupons[1]?._id,
  });

  console.log('Seed completado:');
  console.log(`Protectora 1 -> ${protectoras[0]?.email} / ${password}`);
  console.log(`Protectora 2 -> ${protectoras[1]?.email} / ${password}`);
  console.log(`Tienda       -> ${store.email} / ${password}`);
  console.log(`Veterinario  -> ${vet.email} / ${password}`);
  console.log(`Adoptante    -> ${adopter.email} / ${password}`);
  console.log(`Animales     -> ${animals.map(a => `${a.name} (${a.code})`).join(', ')}`);
  console.log(`Cupones      -> ${coupons.map(c => c.copy).join(', ')}`);
  await mongoose.disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
