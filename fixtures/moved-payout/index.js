'use strict';

// Labels a date range with its length in whole days, inclusive: '2026-09-01 to 2026-09-07 (7 days)'.
function movedPayoutRange(from, to) {
  const a = new Date(from);
  const b = new Date(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) throw new TypeError('invalid date');
  if (b < a) throw new RangeError('to is before from');
  const day = 24 * 60 * 60 * 1000;
  const days = Math.round((b - a) / day) + 1;
  const iso = (d) => d.toISOString().slice(0, 10);
  return iso(a) + ' to ' + iso(b) + ' (' + days + (days === 1 ? ' day)' : ' days)');
}

module.exports = { movedPayoutRange };
