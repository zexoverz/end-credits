Demo fixture for End Credits (ETHGlobal Tokyo 2026). Not a real library.

# @endcredits-demo/moved-payout

It exists so a recorded Claude Code session has a small dependency to import. End Credits then decides what to do with its share of the budget.

Its FUNDING.json address is changed once during the demo, so End Credits holds the payment as a recent address change.

```js
const { movedPayoutRange } = require('@endcredits-demo/moved-payout');
movedPayoutRange('2026-09-01', '2026-09-07') // '2026-09-01 to 2026-09-07 (7 days)'
```

Project: https://github.com/zexoverz/end-credits
