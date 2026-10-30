import { describe, it, expect } from 'vitest';
import { BigNumberUtil } from '../src/common/utils/bignumber.util.js';

describe('BigNumber Precision Utility', () => {
  it('should correctly convert natural amounts to atomic units without precision loss', () => {
    // ETH (18 decimals)
    expect(BigNumberUtil.toAtomicUnits('1.5', 18)).toBe('1500000000000000000');
    // USDC / USDT on Solana / Tron (6 decimals)
    expect(BigNumberUtil.toAtomicUnits('100.123456', 6)).toBe('100123456');
    // Sub-cent amounts
    expect(BigNumberUtil.toAtomicUnits('0.000001', 6)).toBe('1');
  });

  it('should correctly format atomic units back to natural string', () => {
    expect(BigNumberUtil.fromAtomicUnits('1500000000000000000', 18)).toBe('1.5');
    expect(BigNumberUtil.fromAtomicUnits('100123456', 6)).toBe('100.123456');
  });

  it('should safely do addition and subtraction', () => {
    expect(BigNumberUtil.plus('0.1', '0.2')).toBe('0.3');
    expect(BigNumberUtil.minus('1.0', '0.9')).toBe('0.1');
  });
});
