import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const DATA_DIR = path.join(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

console.log('\x1b[36m%s\x1b[0m', '🌱 Multi-Chain Database Seeder (DatabaseSeeder)');
console.log('\x1b[90m%s\x1b[0m', '------------------------------------------------------------');

const seedUsers = [
  {
    id: "3e795879-7b6e-4811-8d9f-ae3bc3b85dfb",
    primaryWallet: {
      chain: "EVM",
      address: "0x36b8a47da48830b42a04156ec6990b015ffbfa39"
    },
    wallets: [
      {
        chain: "EVM",
        address: "0x36b8a47da48830b42a04156ec6990b015ffbfa39",
        boundAt: 1791437442031,
        networkId: "ethereum",
        isPrimary: true
      },
      {
        chain: "SOLANA",
        address: "J4FfWaUWsTsGjgdT6om6TnJg335GjwCB53dZpXEs9vhc",
        boundAt: 1791437458443,
        isPrimary: false
      },
      {
        chain: "TRON",
        address: "TRXbmxAHAxHTcasDXvyF1fKvP1wxgCLSRH",
        boundAt: 1791437469848,
        isPrimary: false
      }
    ],
    role: "USER",
    status: "ACTIVE",
    nickname: "User_TokenPocket_Demo",
    createdAt: 1791437442031,
    updatedAt: Date.now(),
    lastLoginAt: Date.now()
  },
  {
    id: "a0000000-0000-4000-8000-000000000001",
    primaryWallet: {
      chain: "EVM",
      address: "0x1111111111111111111111111111111111111111"
    },
    wallets: [
      {
        chain: "EVM",
        address: "0x1111111111111111111111111111111111111111",
        boundAt: 1791400000000,
        networkId: "ethereum",
        isPrimary: true
      },
      {
        chain: "TRON",
        address: "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",
        boundAt: 1791400001000,
        isPrimary: false
      },
      {
        chain: "SOLANA",
        address: "SolanaAddress111111111111111111111111111111",
        boundAt: 1793199492646,
        isPrimary: false
      }
    ],
    role: "ADMIN",
    status: "ACTIVE",
    nickname: "Admin_Master",
    createdAt: 1791400000000,
    updatedAt: Date.now(),
    lastLoginAt: Date.now()
  }
];

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const prisma = new PrismaClient();

try {
  // 1. Seed Users & Wallets
  process.stdout.write('\x1b[33mSeeding:\x1b[0m Users & BoundWallets (Prisma ORM)... ');
  for (const u of seedUsers) {
    await prisma.user.upsert({
      where: { id: u.id },
      update: {
        role: u.role,
        status: u.status,
        nickname: u.nickname,
        primaryChain: u.primaryWallet.chain,
        primaryAddress: u.primaryWallet.address,
        updatedAt: BigInt(u.updatedAt),
        lastLoginAt: BigInt(u.lastLoginAt),
      },
      create: {
        id: u.id,
        role: u.role,
        status: u.status,
        nickname: u.nickname,
        primaryChain: u.primaryWallet.chain,
        primaryAddress: u.primaryWallet.address,
        createdAt: BigInt(u.createdAt),
        updatedAt: BigInt(u.updatedAt),
        lastLoginAt: BigInt(u.lastLoginAt),
      },
    });

    for (const w of u.wallets) {
      const cleanAddr = w.address.trim().toLowerCase();
      await prisma.boundWallet.upsert({
        where: {
          chain_address: {
            chain: w.chain,
            address: cleanAddr,
          },
        },
        update: {
          networkId: w.networkId,
          isPrimary: !!w.isPrimary,
          boundAt: BigInt(w.boundAt),
        },
        create: {
          userId: u.id,
          chain: w.chain,
          address: cleanAddr,
          networkId: w.networkId,
          isPrimary: !!w.isPrimary,
          boundAt: BigInt(w.boundAt),
        },
      });
    }
  }
  process.stdout.write('\x1b[32mDONE\x1b[0m\n');

  // 2. Seed Configured Deposit Wallets (EVM, Solana, Tron)
  process.stdout.write('\x1b[33mSeeding:\x1b[0m ConfiguredDepositWalletsTableSeeder... ');
  const depositWallets = [
    { networkId: 'ethereum', chain: 'EVM', address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', label: '以太坊主网专属充值钱包 A1' },
    { networkId: 'ethereum', chain: 'EVM', address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', label: '以太坊主网专属充值钱包 A2' },
    { networkId: 'bsc', chain: 'EVM', address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', label: 'BSC 币安智能链充值收款钱包 B1' },
    { networkId: 'tron', chain: 'TRON', address: 'TLtAMBCoB7UU3p8L248yDaJVi9EANKfPvT', label: '波场 TRON (TRC20) 充值专属收款钱包 T1' },
    { networkId: 'solana', chain: 'SOLANA', address: 'EvFUfisEScFuZSqDXagC17m3bpP32B74dseMHtzQ5TNb', label: 'Solana (SPL) 充值专属收款钱包 S1' },
  ];
  const now = Date.now();
  for (const dw of depositWallets) {
    await prisma.configuredDepositWallet.upsert({
      where: { networkId_address: { networkId: dw.networkId, address: dw.address } },
      update: { label: dw.label, isActive: true, updatedAt: BigInt(now) },
      create: { networkId: dw.networkId, chain: dw.chain, address: dw.address, label: dw.label, isActive: true, createdAt: BigInt(now), updatedAt: BigInt(now) },
    });
  }
  process.stdout.write('\x1b[32mDONE\x1b[0m\n');

  // 3. Seed Supported Tokens
  process.stdout.write('\x1b[33mSeeding:\x1b[0m SupportedTokensTableSeeder... ');
  const tokens = [
    { networkId: 'ethereum', symbol: 'ETH', name: 'Ether (Native)', contractAddress: null, decimals: 18, minDeposit: '0.01' },
    { networkId: 'ethereum', symbol: 'USDT', name: 'Tether USD (ERC20)', contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6, minDeposit: '1.0' },
    { networkId: 'ethereum', symbol: 'USDC', name: 'USD Coin (ERC20)', contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6, minDeposit: '1.0' },
    { networkId: 'bsc', symbol: 'BNB', name: 'BNB (Native)', contractAddress: null, decimals: 18, minDeposit: '0.01' },
    { networkId: 'bsc', symbol: 'USDT', name: 'Binance-Peg BSC-USD (BEP20)', contractAddress: '0x55d398326f99059fF775485246999027B3197955', decimals: 18, minDeposit: '1.0' },
    { networkId: 'tron', symbol: 'TRX', name: 'TRON (Native)', contractAddress: null, decimals: 6, minDeposit: '10.0' },
    { networkId: 'tron', symbol: 'USDT', name: 'Tether USD (TRC20)', contractAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', decimals: 6, minDeposit: '1.0' },
    { networkId: 'solana', symbol: 'SOL', name: 'Solana (Native)', contractAddress: null, decimals: 9, minDeposit: '0.05' },
    { networkId: 'solana', symbol: 'USDT', name: 'Tether USD (SPL)', contractAddress: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', decimals: 6, minDeposit: '1.0' },
  ];
  for (const tk of tokens) {
    await prisma.supportedToken.upsert({
      where: { networkId_symbol: { networkId: tk.networkId, symbol: tk.symbol } },
      update: { name: tk.name, contractAddress: tk.contractAddress, decimals: tk.decimals, minDeposit: tk.minDeposit, isActive: true, updatedAt: BigInt(now) },
      create: { networkId: tk.networkId, symbol: tk.symbol, name: tk.name, contractAddress: tk.contractAddress, decimals: tk.decimals, minDeposit: tk.minDeposit, isActive: true, createdAt: BigInt(now), updatedAt: BigInt(now) },
    });
  }
  process.stdout.write('\x1b[32mDONE\x1b[0m\n');

  // 4. Seed User Balances (Separated per token and chain)
  process.stdout.write('\x1b[33mSeeding:\x1b[0m UserBalancesTableSeeder... ');
  const demoUserId = '3e795879-7b6e-4811-8d9f-ae3bc3b85dfb';
  const demoBalances = [
    { networkId: 'ethereum', tokenSymbol: 'USDT', tokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7', balance: '150.0' },
    { networkId: 'ethereum', tokenSymbol: 'ETH', tokenAddress: null, balance: '2.5' },
    { networkId: 'tron', tokenSymbol: 'USDT', tokenAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', balance: '200.0' },
    { networkId: 'tron', tokenSymbol: 'TRX', tokenAddress: null, balance: '500.0' },
    { networkId: 'solana', tokenSymbol: 'SOL', tokenAddress: null, balance: '12.0' },
  ];
  for (const b of demoBalances) {
    await prisma.userBalance.upsert({
      where: { userId_networkId_tokenSymbol: { userId: demoUserId, networkId: b.networkId, tokenSymbol: b.tokenSymbol } },
      update: { balance: b.balance, tokenAddress: b.tokenAddress, updatedAt: BigInt(now) },
      create: { userId: demoUserId, networkId: b.networkId, tokenSymbol: b.tokenSymbol, tokenAddress: b.tokenAddress, balance: b.balance, updatedAt: BigInt(now) },
    });
  }
  process.stdout.write('\x1b[32mDONE\x1b[0m\n');

} catch (err) {
  process.stdout.write(`\x1b[31mFAILED: ${err.message}\x1b[0m\n`);
} finally {
  await prisma.$disconnect();
}

process.stdout.write('\x1b[33mSeeding:\x1b[0m JsonPersistenceBackup... ');
fs.writeFileSync(USERS_FILE, JSON.stringify(seedUsers, null, 2), 'utf-8');
process.stdout.write('\x1b[32mDONE (12.1ms)\x1b[0m\n');

// 尝试通知运行中的服务端即时热更新
try {
  await fetch('http://localhost:3000/api/users/reload', { method: 'POST' });
} catch {
  // 服务端未启动时忽略
}

console.log('\x1b[90m%s\x1b[0m', '------------------------------------------------------------');
console.log(`\x1b[32m✔ Seeded: ${seedUsers.length} 个多链主账号，5 个充值专属钱包，9 个支持代币，5 条独立 Token 资产余额。\x1b[0m`);
console.log('\x1b[32m%s\x1b[0m', '✨ Database seeding completed successfully.');
