# Guess Poker – Fully Encrypted Card Guessing on Ethereum

Guess Poker is an end-to-end decentralized application that demonstrates how Fully Homomorphic Encryption (FHE) protects player privacy while keeping payouts transparent. Players spend `0.001 ETH` to receive an encrypted poker card, submit a guess for both suit and rank, and get rewarded instantly according to the accuracy of their prediction. All sensitive card values stay encrypted on-chain through Zama’s FHEVM tooling, yet the smart contract still evaluates guesses and settles payouts without ever exposing the card.

## Why Guess Poker Matters

- **Confidential gameplay:** Encrypted suits and ranks prevent node operators, explorers, or script writers from front-running or leaking the draw.
- **Trustless payouts:** Rewards (`0.0001 ETH` for suit, `0.001 ETH` for rank, `0.002 ETH` for an exact match) are distributed automatically, eliminating custodial risks.
- **Provable fairness:** Every session stores immutable events (`GameStarted`, `GuessEvaluated`) that auditors can verify against on-chain state and player balances.
- **Seamless UX:** The front end combines RainbowKit, wagmi, viem, and ethers to deliver a familiar wallet flow without sacrificing security.

## Gameplay Overview

1. **Start a round:** Pay the `0.001 ETH` game fee to call `startGame`. The contract draws a random suit (1–4) and rank (1–13), encrypts them, and shares the ciphertext with the player.
2. **Review encrypted data:** The client uses Zama’s relayer to decrypt the ciphertext locally for the authorized player account.
3. **Submit a guess:** Call `makeGuess` with suit and rank integers. Invalid ranges revert to protect bankroll integrity.
4. **Receive rewards:** The contract evaluates the guess server-side, transfers the matching payout, emits events, and closes the session.

## Project Structure

```
guess-poker/
├── contracts/EncryptedPokerGame.sol   # Core FHE-enabled game contract
├── deploy/deploy.ts                   # Hardhat-deploy script (dotenv + Infura integration)
├── deployments/sepolia/               # Generated ABI and addresses used by the frontend
├── tasks/                             # Custom Hardhat tasks for maintenance and debugging
├── test/                              # TypeScript-based Hardhat test suites
├── game/                              # React + Vite frontend application
│   ├── src/                           # UI, viem queries, ethers writes, Zama relayer
│   └── package.json                   # Frontend dependencies and scripts
├── hardhat.config.ts                  # Network, compiler, and plugin configuration
└── docs/                              # Zama-specific integration notes for contracts and relayer
```

## Technology Stack

- **Blockchain:** Solidity `0.8.27`, Hardhat, hardhat-deploy, TypeChain
- **Privacy:** Zama FHEVM libraries (`@fhevm/solidity`, Sepolia config, encrypted types)
- **Randomness:** Deterministic pseudo-random draw seeded with `block.prevrandao`, timestamp, caller, and nonce
- **Frontend:** React 19, Vite, TypeScript, RainbowKit, wagmi, viem (read), ethers (write), Zama relayer SDK
- **Tooling:** ESLint, Prettier, Solhint, Solidity coverage, Gas reporter

## Problem Statement & Solution

- **Visibility risk in traditional games:** Conventional blockchain games leak card values or rely on off-chain secrecy. Guess Poker keeps the draw encrypted even on public ledgers.
- **Manual payout friction:** On-chain escrow simplifies operations but exposes the house to race conditions. The contract enforces bankroll checks before accepting new games and guarantees atomic payouts.
- **Fragmented player experience:** Integrating RainbowKit and wagmi provides wallet onboarding, while viem + ethers split read/write responsibilities cleanly as required by the architecture.
- **Compliance with modern privacy guarantees:** By default, neither storage nor events disclose the raw card, creating a blueprint for compliant, privacy-preserving entertainment dApps.

## Smart Contract Highlights (`contracts/EncryptedPokerGame.sol`)

- **Session lifecycle:** Stores exactly one active game per address, cleans state on settlement, and reverts duplicate attempts with `ActiveGameExists`.
- **Encrypted state management:** Uses `FHE.asEuint8` and `FHE.allow` to encrypt and authorize access for the contract and the current player only.
- **Deterministic randomness:** The `_drawCard` helper mixes `block.prevrandao`, block timestamp, caller address, and a nonce to construct reproducible randomness for audits.
- **Bankroll protection:** Validates bankroll before issuing new sessions and before transfers; emits `InsufficientBankroll` if the house cannot cover `FULL_REWARD`.
- **Administrative safety:** Owner-restricted withdrawals and ownership transfers with comprehensive error checks (`NotOwner`, `InvalidOwner`, `InvalidRecipient`).

## Frontend Highlights (`game/`)

- **Wallet onboarding:** RainbowKit modal for connecting supported wallets on Sepolia without relying on local environments.
- **Encrypted workflows:** Uses Zama relayer SDK to decrypt ciphertexts authorized by the smart contract and display readable card data to the rightful player alone.
- **State management:** React Query handles contract reads via viem while preserving UI responsiveness.
- **Gas-efficient writes:** ethers `Contract` instances perform fee-bearing mutations (`startGame`, `makeGuess`, `withdraw`) with clear status feedback.

## Getting Started

### Prerequisites

- Node.js `>= 20`
- npm `>= 7`
- A Sepolia-funded wallet private key (never a mnemonic) exported as `DEPLOYER_PRIVATE_KEY`
- An Infura project key stored as `INFURA_API_KEY`

### Install Dependencies

```bash
npm install                         # Root: contracts + tooling
cd game && npm install              # Frontend
```

### Configure Environment

1. Create a `.env` file in the project root with the following variables:
   ```bash
   DEPLOYER_PRIVATE_KEY=0xYOUR_PRIVATE_KEY
   INFURA_API_KEY=your_infura_project_id
   ETHERSCAN_API_KEY=optional_for_verification
   REPORT_GAS=false
   ```
2. The Hardhat config and deploy script already import `dotenv` and read these variables through `process.env`. No mnemonic is required or supported.

### Contract Workflow

```bash
npm run compile            # Generate artifacts and types
npm run test               # Run local Hardhat tests
npm run lint               # Enforce Solidity + TypeScript style
npm run deploy:localhost   # Deploy to a local node if desired
npm run deploy:sepolia     # Deploy using Infura + DEPLOYER_PRIVATE_KEY
npm run verify:sepolia     # Optional: Verify on Etherscan
```

Generated ABIs are stored automatically under `deployments/sepolia`. Always copy these files into the frontend when updating contracts so the UI stays in sync with the latest deployment.

### Frontend Workflow

```bash
cd game
npm run dev        # Start the Vite development server
npm run build      # Produce production assets in game/dist
npm run preview    # Preview the production build locally
```

The frontend targets the Sepolia network directly and does not rely on localhost RPC endpoints or browser storage. Ensure the connected wallet matches the contract deployment network for a seamless experience.

## Roadmap

- **Leaderboard & history:** Persist decrypted guesses on the client side and publish aggregated leaderboards without exposing raw card values on-chain.
- **Multi-round stakes:** Extend the contract with configurable game fees and tiered rewards, guarded by encrypted comparisons.
- **Custom randomness oracle:** Integrate verifiable randomness (e.g., Chainlink VRF) once FHE-compatible adapters become available for stronger entropy.
- **Mobile-first UI polish:** Enhance the React application with responsive layouts and accessibility audits tailored to wallet browsers.
- **Analytics & alerts:** Add optional notification services (email, SMS, push) triggered by Hardhat tasks that monitor `GuessEvaluated` events.
- **Localization:** Introduce multilingual content once translation workflows for encrypted insights are defined.

## Contributing & Support

- **Testing:** Contributions must pass `npm run lint` and `npm run test` in the root plus `npm run lint` in `game/`.
- **Issues:** Use the repository’s issue tracker to report bugs, request features, or propose enhancements.
- **Documentation:** Reference the materials in `docs/zama_llm.md` and `docs/zama_doc_relayer.md` for deeper guidance on Zama tooling.

## License

This project is distributed under the BSD-3-Clause-Clear License. Refer to the [LICENSE](LICENSE) file for full terms.
