import { defineConfig } from "hardhat/config";
import ethers from "@nomicfoundation/hardhat-ethers";
import mocha from "@nomicfoundation/hardhat-mocha";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export default defineConfig({
  plugins: [ethers, mocha],
  solidity: {
    version: "0.8.28",
    path: require.resolve("solc/soljson.js"),
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
});
