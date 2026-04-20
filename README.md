# FreelanceEscrow Contracts

Smart contracts for the FreelanceEscrow capstone project at HEC/UNIL.

This repository contains the Solidity contracts, Hardhat configuration, deployment script, and automated test suite for the escrow logic used by the rest of the team.

## Current status

- Core escrow flow implemented
- Milestone flow implemented
- Auto-release implemented
- Cancel/refund implemented
- Dispute flow implemented
- Local test suite passing

## Stack

- Solidity `0.8.28`
- Hardhat `^2.22.0`
- OpenZeppelin `^5.1.0`
- ethers v6 via Hardhat Toolbox

## Project structure

```text
freelance-escrow-contracts/
├── contracts/
│   ├── FreelanceEscrow.sol
│   └── mocks/MockUSDC.sol
├── scripts/
│   └── deploy.js
├── test/
│   ├── unit/
│   ├── integration/
│   └── helpers.js
├── docs/
│   ├── FOR_FRONTEND.md
│   ├── FOR_INTEGRATION.md
│   └── FOR_TESTING.md
├── hardhat.config.js
├── package.json
└── .env.example
```

## Install

Use Node.js 20.x.

```bash
npm install
```

## Run tests

```bash
npx hardhat test
```

## Coverage

```bash
npm run coverage
```

Latest local result:

- Statements: `100%`
- Branches: `95.38%`
- Functions: `100%`
- Lines: `100%`

## Deploy

Local:

```bash
npx hardhat run scripts/deploy.js
```

Sepolia:

```bash
npx hardhat run scripts/deploy.js --network sepolia
```

Before Sepolia deployment, create a `.env` from `.env.example`.

## Main contract flows

### Client

- Approve MockUSDC to the escrow contract
- Call `createProject`
- Approve completed milestones with `approveMilestone`
- Cancel inactive work with `cancelProject`
- Raise dispute with `raiseDispute`

### Freelancer

- Call `completeMilestone`
- Claim expired milestone after 14 days with `claimExpiredMilestone`
- Raise dispute with `raiseDispute`

### Owner

- Resolve disputes with `resolveDispute`
- Withdraw fees with `withdrawFees`
- Pause/unpause contract

## Useful docs for the team

- Frontend handoff: [docs/FOR_FRONTEND.md](docs/FOR_FRONTEND.md)
- Integration handoff: [docs/FOR_INTEGRATION.md](docs/FOR_INTEGRATION.md)
- Testing handoff: [docs/FOR_TESTING.md](docs/FOR_TESTING.md)

## Notes

- Payments use a single ERC-20 token set at deployment time.
- `MockUSDC` uses 6 decimals to mimic USDC-style amounts.
- The repository currently focuses on Person 1 scope: smart contracts, tests, deployment, and technical handoff.
