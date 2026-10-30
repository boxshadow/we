import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const DATA_DIR = path.join(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

console.log('\x1b[36m%s\x1b[0m', '⚡ Multi-Chain Database Reset & Fresh Seeder (migrate:fresh --seed)');
console.log('\x1b[90m%s\x1b[0m', '------------------------------------------------------------');

// 1. Drop all tables / records
process.stdout.write('\x1b[33mDropping all tables / records:\x1b[0m ... ');
if (fs.existsSync(USERS_FILE)) {
  fs.unlinkSync(USERS_FILE);
}

const prisma = new PrismaClient();
try {
  await prisma.userBalance.deleteMany();
  await prisma.supportedToken.deleteMany();
  await prisma.configuredDepositWallet.deleteMany();
  await prisma.depositOrder.deleteMany();
  await prisma.sweepRecord.deleteMany();
  await prisma.boundWallet.deleteMany();
  await prisma.user.deleteMany();
  process.stdout.write('\x1b[32mDONE (All Prisma Tables Cleared)\x1b[0m\n');
} catch (err) {
  process.stdout.write(`\x1b[33mSKIPPED (${err.message})\x1b[0m\n`);
} finally {
  await prisma.$disconnect();
}

// 2. Run migrations
await import('./migrate.mjs');

// 3. Run seeds
await import('./seed.mjs');

console.log('\x1b[32m%s\x1b[0m', '🚀 All tables refreshed and seeded fresh successfully!');
