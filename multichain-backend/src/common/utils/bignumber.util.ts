import BigNumber from 'bignumber.js';

export class BigNumberUtil {
  /**
   * Convert natural amount (e.g. 1.5 ETH) to base atomic units (e.g. 1500000000000000000 wei)
   */
  static toAtomicUnits(amount: string | number, decimals: number): string {
    const bn = new BigNumber(amount);
    const multiplier = new BigNumber(10).pow(decimals);
    return bn.multipliedBy(multiplier).toFixed(0, BigNumber.ROUND_DOWN);
  }

  /**
   * Convert base atomic units to natural decimal string
   */
  static fromAtomicUnits(atomicAmount: string | number | bigint, decimals: number): string {
    const bn = new BigNumber(atomicAmount.toString());
    const divisor = new BigNumber(10).pow(decimals);
    return bn.dividedBy(divisor).toString();
  }

  /**
   * Safe addition
   */
  static plus(a: string | number, b: string | number): string {
    return new BigNumber(a).plus(new BigNumber(b)).toString();
  }

  /**
   * Safe subtraction
   */
  static minus(a: string | number, b: string | number): string {
    return new BigNumber(a).minus(new BigNumber(b)).toString();
  }
}
