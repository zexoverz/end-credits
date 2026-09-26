'use strict';

// Formats a micro-USDC amount as USDC with two to six decimals: 10000 -> '0.01 USDC'.
function tipJarAmount(micro) {
  const n = BigInt(micro);
  if (n < 0n) throw new RangeError('negative amount');
  const whole = n / 1000000n;
  const frac = (n % 1000000n).toString().padStart(6, '0').replace(/0{1,4}$/, '');
  return whole + '.' + frac.padEnd(2, '0') + ' USDC';
}

module.exports = { tipJarAmount };
