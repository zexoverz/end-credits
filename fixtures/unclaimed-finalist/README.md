Demo fixture for End Credits (ETHGlobal Tokyo 2026). Not a real library.

# @endcredits-demo/unclaimed-finalist

It exists so a recorded Claude Code session has a small dependency to import. End Credits then decides what to do with its share of the budget.

It has no funding file on purpose: End Credits reserves its share until the repo is claimed. Kept for the finalist run, since a claim is one-shot.

```js
const { formatUnclaimedFinalist } = require('@endcredits-demo/unclaimed-finalist');
formatUnclaimedFinalist(1.5) // '1.50 USDC unclaimed'
```

Project: https://github.com/zexoverz/end-credits
