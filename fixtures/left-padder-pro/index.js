'use strict';

// Pads a value on the left to length n, for aligning columns in a plain-text report.
function leftPad(s, n, ch) {
  const str = String(s);
  const fill = ch === undefined ? ' ' : String(ch);
  if (fill.length !== 1) throw new TypeError('ch must be one character');
  return str.length >= n ? str : fill.repeat(n - str.length) + str;
}

module.exports = { leftPad };
