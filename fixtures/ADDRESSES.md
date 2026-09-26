# Fixture addresses

Addresses only. The keys were never saved: nobody needs to sign from these, they only receive.

| Label | Address | Used by |
|---|---|---|
| A | `0x52DBDeaDd4ED42877dC6099A3B1C02c79876B551` | `moved-payout` `FUNDING.json` at first, observed by the warm-up session |
| B | `0xeF4509C258107F5A37fb7e76af4F99a7DD3c6aa2` | `moved-payout` `FUNDING.json` after the change, so the recorded session holds it with `ADDRESS_CHANGED` |
| SDN | `0x098B716B8Aaf21512996dC57EB0615e2383E2f96` | `left-padder-pro` `FUNDING.json`; OFAC SDN (Lazarus Group / Ronin, SDN.CSV entry 27307), refused by Intercepta |

The `unclaimed-*` fixtures have no funding file.
