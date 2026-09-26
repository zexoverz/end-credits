'use strict';

// Shortens an address for display: '0x9ebd…aFA3'.
function swappedJarShort(address) {
  if (typeof address !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(address)) throw new TypeError('invalid address');
  return address.slice(0, 6) + '…' + address.slice(-4);
}

module.exports = { swappedJarShort };
