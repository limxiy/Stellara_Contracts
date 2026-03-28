Multisig Treasury
=================

Overview
--------

`MultisigTreasury.sol` provides a multi-signature treasury with:
- M-of-N approvals for large withdrawals
- Configurable daily/weekly spending limits
- Proposal (transaction) submission and approval workflow
- Audit events for all actions
- Emergency freeze (immediate) and multisig unfreeze

Quick test
----------

From the `Contracts` folder:

```bash
pnpm install      # or npm install
npx hardhat test
```

Notes
-----
- To unfreeze the contract after an emergency freeze, submit a transaction targeting the treasury itself with data `unfreezeInternal()` and execute it with the required multisig confirmations.
