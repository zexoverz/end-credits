Demo fixture for End Credits (ETHGlobal Tokyo 2026). Not a real library.

# @endcredits-demo/tip-jar

It exists so a recorded Claude Code session has a small dependency to import. End Credits then decides what to do with its share of the budget.

Its FUNDING.json names a payee under `drips.ethereum.ownedBy` and the maintainer's own x402 endpoint under `x402.endpoint`. The endpoint asks to be paid to that same address, so the paying agent screens it and pays it there, agent to agent.

```js
const { tipJarAmount } = require('@endcredits-demo/tip-jar');
tipJarAmount(10000) // '0.01 USDC'
```

Project: https://github.com/zexoverz/end-credits
