import * as dotenv from "dotenv";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

dotenv.config();

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (!process.env.INFURA_API_KEY) {
    console.warn("INFURA_API_KEY is not configured");
  }

  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployment = await deploy("EncryptedPokerGame", {
    from: deployer,
    log: true,
  });

  console.log(`EncryptedPokerGame contract: ${deployment.address}`);
};

export default func;
func.id = "deploy_encryptedPokerGame"; // id required to prevent reexecution
func.tags = ["EncryptedPokerGame"];
