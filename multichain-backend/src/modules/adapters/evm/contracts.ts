import { parseAbi } from 'viem';

// Standard ERC20 ABI with Allowance and Approval
export const ERC20_ABI = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function transfer(address recipient, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transferFrom(address sender, address recipient, uint256 amount) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
]);

// Uniswap V2 Factory ABI
export const UNISWAP_V2_FACTORY_ABI = parseAbi([
  'function getPair(address tokenA, address tokenB) view returns (address pair)',
  'function allPairs(uint256) view returns (address pair)',
  'function allPairsLength() view returns (uint256)',
  'function createPair(address tokenA, address tokenB) returns (address pair)',
]);

// Uniswap V2 Pair ABI
export const UNISWAP_V2_PAIR_ABI = parseAbi([
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function price0CumulativeLast() view returns (uint256)',
  'function price1CumulativeLast() view returns (uint256)',
]);

// Uniswap V2 Router ABI
export const UNISWAP_V2_ROUTER_ABI = parseAbi([
  'function factory() view returns (address)',
  'function WETH() view returns (address)',
  'function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity)',
  'function addLiquidityETH(address token, uint256 amountTokenDesired, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline) payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity)',
  'function removeLiquidity(address tokenA, address tokenB, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) returns (uint256 amountA, uint256 amountB)',
  'function removeLiquidityETH(address token, uint256 liquidity, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline) returns (uint256 amountToken, uint256 amountETH)',
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) returns (uint256[] memory amounts)',
  'function swapExactETHForTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) payable returns (uint256[] memory amounts)',
  'function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) returns (uint256[] memory amounts)',
  'function getAmountsOut(uint256 amountIn, address[] calldata path) view returns (uint256[] memory amounts)',
]);

// Lightweight OpenZeppelin-compatible ERC-20 Deploy ABI for constructor
export const ERC20_DEPLOY_ABI = parseAbi([
  'constructor(string name, string symbol, uint8 decimals, uint256 initialSupply, address recipient)',
]);

// Standard Dead Address for permanent burning / locking
export const DEAD_ADDRESS_EVM = '0x000000000000000000000000000000000000dEaD' as const;

// Token & LP Locker ABI (PinkLock / UniCrypt compatible)
export const TOKEN_LOCKER_ABI = parseAbi([
  'function lock(address token, uint256 amount, uint256 unlockDate, address beneficiary) returns (uint256 lockId)',
  'function unlock(uint256 lockId) returns (bool)',
  'function withdraw(uint256 lockId) returns (bool)',
  'function getLock(uint256 lockId) view returns (address token, uint256 amount, uint256 unlockDate, address beneficiary, bool withdrawn)',
]);
