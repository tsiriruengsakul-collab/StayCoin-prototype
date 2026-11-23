import { network } from "hardhat";

const { ethers } = await network.create();
const chain = await ethers.provider.getNetwork();
if (chain.chainId !== 31337n) throw new Error("This script deploys only to the local development chain.");
const contract = await ethers.deployContract("StayCoinNightToken");
await contract.waitForDeployment();
console.log("Local contract address:", await contract.getAddress());
