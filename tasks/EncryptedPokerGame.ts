import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

const CONTRACT_NAME = "EncryptedPokerGame";

task("task:address", "Prints the EncryptedPokerGame address").setAction(async (_, hre) => {
  const deployment = await hre.deployments.get(CONTRACT_NAME);
  console.log(`${CONTRACT_NAME} address: ${deployment.address}`);
});

task("task:start-game", "Starts a new encrypted poker session")
  .addOptionalParam("address", "Override contract address")
  .setAction(async (taskArguments: TaskArguments, hre) => {
    const { ethers } = hre;

    const deployment = taskArguments.address
      ? { address: taskArguments.address as string }
      : await hre.deployments.get(CONTRACT_NAME);

    const signer = (await ethers.getSigners())[0];
    const contract = await ethers.getContractAt(CONTRACT_NAME, deployment.address);

    const tx = await contract.connect(signer).startGame({ value: ethers.parseEther("0.001") });
    console.log(`Starting game with tx ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`Game started in block ${receipt?.blockNumber}`);
  });

task("task:make-guess", "Submits a guess for the active game")
  .addOptionalParam("address", "Override contract address")
  .addParam("suit", "Suit guess: 1-4")
  .addParam("rank", "Rank guess: 1-13")
  .setAction(async (taskArguments: TaskArguments, hre) => {
    const { ethers } = hre;

    const suit = Number(taskArguments.suit);
    const rank = Number(taskArguments.rank);

    if (!Number.isInteger(suit) || suit < 1 || suit > 4) {
      throw new Error("Suit must be an integer between 1 and 4");
    }

    if (!Number.isInteger(rank) || rank < 1 || rank > 13) {
      throw new Error("Rank must be an integer between 1 and 13");
    }

    const deployment = taskArguments.address
      ? { address: taskArguments.address as string }
      : await hre.deployments.get(CONTRACT_NAME);

    const signer = (await ethers.getSigners())[0];
    const contract = await ethers.getContractAt(CONTRACT_NAME, deployment.address);

    const tx = await contract.connect(signer).makeGuess(suit, rank);
    console.log(`Submitting guess with tx ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`Guess processed in block ${receipt?.blockNumber}`);
  });

task("task:active-game", "Reads encrypted card handles for a player")
  .addOptionalParam("address", "Override contract address")
  .addOptionalParam("player", "Player address to inspect")
  .setAction(async (taskArguments: TaskArguments, hre) => {
    const { ethers } = hre;

    const deployment = taskArguments.address
      ? { address: taskArguments.address as string }
      : await hre.deployments.get(CONTRACT_NAME);

    const player = (taskArguments.player as string) ?? (await ethers.getSigners())[0].address;
    const contract = await ethers.getContractAt(CONTRACT_NAME, deployment.address);

    const [isActive, encryptedSuit, encryptedRank] = await contract.getActiveGame(player);
    console.log(`Active: ${isActive}`);
    if (isActive) {
      console.log(`Encrypted suit handle: ${encryptedSuit}`);
      console.log(`Encrypted rank handle: ${encryptedRank}`);
    }
  });
