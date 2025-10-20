import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { EncryptedPokerGame, EncryptedPokerGame__factory } from "../types";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("EncryptedPokerGame")) as EncryptedPokerGame__factory;
  const contract = (await factory.deploy()) as EncryptedPokerGame;
  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();

  return { contract, contractAddress };
}

describe("EncryptedPokerGame", function () {
  let signers: Signers;
  let contract: EncryptedPokerGame;
  let contractAddress: string;

  before(async function () {
    const [deployer, alice, bob] = await ethers.getSigners();
    signers = { deployer, alice, bob };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn("This hardhat test suite cannot run on Sepolia Testnet");
      this.skip();
    }

    ({ contract, contractAddress } = await deployFixture());
  });

  it("reverts startGame when bankroll is insufficient", async function () {
    await expect(contract.connect(signers.alice).startGame({ value: ethers.parseEther("0.001") })).to.be.revertedWithCustomError(
      contract,
      "InsufficientBankroll",
    );
  });

  it("stores encrypted card handles on start", async function () {
    const fullReward = await contract.FULL_REWARD();

    await signers.deployer.sendTransaction({ to: contractAddress, value: fullReward });

    const startTx = await contract.connect(signers.alice).startGame({ value: ethers.parseEther("0.001") });
    await startTx.wait();

    const [isActive, encryptedSuit, encryptedRank] = await contract.getActiveGame(signers.alice.address);

    expect(isActive).to.eq(true);
    expect(encryptedSuit).to.not.eq(ethers.ZeroHash);
    expect(encryptedRank).to.not.eq(ethers.ZeroHash);
  });

  it("prevents multiple active games per player", async function () {
    const fullReward = await contract.FULL_REWARD();
    await signers.deployer.sendTransaction({ to: contractAddress, value: fullReward });

    await contract.connect(signers.alice).startGame({ value: ethers.parseEther("0.001") });

    await expect(contract.connect(signers.alice).startGame({ value: ethers.parseEther("0.001") })).to.be.revertedWithCustomError(
      contract,
      "ActiveGameExists",
    );
  });

  it("resolves a losing guess without payouts", async function () {
    const fullReward = await contract.FULL_REWARD();
    await signers.deployer.sendTransaction({ to: contractAddress, value: fullReward });

    await contract.connect(signers.alice).startGame({ value: ethers.parseEther("0.001") });

    const [, encryptedSuit, encryptedRank] = await contract.getActiveGame(signers.alice.address);
    const suit = await fhevm.userDecryptEuint(FhevmType.euint8, encryptedSuit, contractAddress, signers.alice);
    const rank = await fhevm.userDecryptEuint(FhevmType.euint8, encryptedRank, contractAddress, signers.alice);

    const wrongSuit = suit === 4n ? 3n : suit + 1n;
    const wrongRank = rank === 13n ? 12n : rank + 1n;

    const balanceBeforeGuess = await ethers.provider.getBalance(contractAddress);

    await contract.connect(signers.alice).makeGuess(Number(wrongSuit), Number(wrongRank));

    const balanceAfterGuess = await ethers.provider.getBalance(contractAddress);
    expect(balanceAfterGuess).to.eq(balanceBeforeGuess);

    const [isActive] = await contract.getActiveGame(signers.alice.address);
    expect(isActive).to.eq(false);
  });

  it("pays the full reward for exact matches", async function () {
    const fullReward = await contract.FULL_REWARD();
    await signers.deployer.sendTransaction({ to: contractAddress, value: fullReward * 2n });

    await contract.connect(signers.alice).startGame({ value: ethers.parseEther("0.001") });

    const [, encryptedSuit, encryptedRank] = await contract.getActiveGame(signers.alice.address);

    const suit = await fhevm.userDecryptEuint(FhevmType.euint8, encryptedSuit, contractAddress, signers.alice);
    const rank = await fhevm.userDecryptEuint(FhevmType.euint8, encryptedRank, contractAddress, signers.alice);

    const balanceBeforeGuess = await ethers.provider.getBalance(contractAddress);

    const tx = await contract.connect(signers.alice).makeGuess(Number(suit), Number(rank));
    await tx.wait();

    const balanceAfterGuess = await ethers.provider.getBalance(contractAddress);
    expect(balanceBeforeGuess - balanceAfterGuess).to.eq(fullReward);
  });
});
