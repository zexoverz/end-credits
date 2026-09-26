Demo fixture for End Credits (ETHGlobal Tokyo 2026). Not a real library.

# @endcredits-demo/unclaimed-utils

It exists so a recorded Claude Code session has a small dependency to import. End Credits then decides what to do with its share of the budget.

It has no funding file on purpose: End Credits reserves its share until the repo is claimed. This is the one claimed live in the judged demo.

```js
const { formatUnclaimed } = require('@endcredits-demo/unclaimed-utils');
formatUnclaimed(1.5) // '1.50 USDC unclaimed'
```

Project: https://github.com/zexoverz/end-credits
