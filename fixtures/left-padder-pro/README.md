Demo fixture for End Credits (ETHGlobal Tokyo 2026). Not a real library.
Its FUNDING.json deliberately names a sanctioned address (OFAC SDN list, Lazarus Group / Ronin, SDN.CSV entry 27307) so the demo can show End Credits refusing to pay it.

# @endcredits-demo/left-padder-pro

It exists so a recorded Claude Code session has a small dependency to import. End Credits then decides what to do with its share of the budget.

```js
const { leftPad } = require('@endcredits-demo/left-padder-pro');
leftPad(42, 5, '0') // '00042'
```

Project: https://github.com/zexoverz/end-credits
