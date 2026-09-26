# Feature map

`feature-map.json` lists execute paths a funded mainnet round has recorded. No row means the
path is unrecorded here, with no pass or fail stored for it. Surfpool results and unit results
stay in the test suite.

Add a row only after a live spend, in the same change set as the QA notes for that path. Copy
measured figures into the row. Omit a key the round did not record. `codeSha` is the commit
the round ran, not the commit that added the row.

A row has these keys.

- `status`. `live-validated` when the spend was simulated, sent, and reconciled.
- `action`. The Action `type`, such as `add_liquidity` or `remove_liquidity`.
- `protocol`. The venue protocol on that Action.
- `issue`. The GitHub issue number for the round.
- `codeSha`. The full commit the round ran.
- `cluster`. `mainnet` on the rows in this file.
- `position`, `pool`, and `owner`. The accounts the round named.
- `maxSlippageBps`. The slippage cap on every send in the row.
- `qa`. The repo path and heading anchor of the notes.
- `sends`. One object per confirmed signature, in send order.
- `gaps`. What that round left unmeasured. Required. An empty array means the notes record no gap.

A send always has `signature`. It has `bps` when the Action takes a fraction of current
liquidity. Any other key is present only when that send recorded it. Token amounts and
liquidity shares are strings, so a share above a JSON number's exact range stays exact.
`simulation.computeUnits` is the recorded compute-unit count.

- `simulation` holds `computeUnits`, `estA`, `estB`, and `violations` when the send recorded
  them. `estA` and `estB` are raw base units.
- `venue` holds `requiredA` and `requiredB`, raw base units, when a deposit quote recorded them.
- `liquidity` holds `before` and `after`, the raw share, when the send recorded that side.
- `positionTokens` and `wallet` hold `a` and `b` when recorded. Each side has `symbol` and
  `unit` (`raw` or `display`), plus the `before`, `after`, or `delta` figures that were
  recorded. `delta` keeps the sign as recorded.
- `wallet.sol` holds `delta` in SOL and `feeLamportsApprox` when recorded. A leading `~` on
  `feeLamportsApprox` means the notes gave an approximation.

A sentence in `gaps` records a hole in the round. The hole stays open.
