Demo fixture for End Credits (ETHGlobal Tokyo 2026). Not a real library.

# @endcredits-demo/swapped-jar

It exists so a recorded Claude Code session has a small dependency to import. End Credits then decides what to do with its share of the budget.

On purpose, its x402 endpoint asks to be paid to a different address than the one its FUNDING.json lists (a clipper). The paying agent refuses before it signs anything.

```js
const { swappedJarShort } = require('@endcredits-demo/swapped-jar');
swappedJarShort('0x9ebdC8ACc879a8284Ae5B3CecfbD280ec307aFA3') // '0x9ebd…aFA3'
```

Project: https://github.com/zexoverz/end-credits
