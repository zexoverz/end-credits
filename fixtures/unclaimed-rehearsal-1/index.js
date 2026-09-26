'use strict';

// Formats an amount that is being held for a maintainer who has not claimed it yet.
function formatUnclaimedRehearsal1(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) throw new TypeError('amount must be a finite number');
  return n.toFixed(2) + ' USDC unclaimed';
}

module.exports = { formatUnclaimedRehearsal1 };
