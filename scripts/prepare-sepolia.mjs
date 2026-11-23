import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import solc from "solc";
import { runtimeFingerprint } from "../src/runtimeCode.ts";

const name = "StayCoinNightTokenV2";
const source = "contracts/" + name + ".sol";
const artifact = JSON.parse(readFileSync("artifacts/" + source + "/" + name + ".json", "utf8"));
const flattened = execFileSync(process.execPath, ["node_modules/hardhat/dist/src/cli.js", "flatten", source], { encoding: "utf8" });
const file = name + ".sol";
const compilerInput = {
  language: "Solidity",
  sources: { [file]: { content: flattened } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "cancun",
    outputSelection: { "*": { "*": ["abi", "evm.deployedBytecode.object"] } },
  },
};
assert.match(solc.version(), /^0\.8\.28\+/);
const output = JSON.parse(solc.compile(JSON.stringify(compilerInput)));
const errors = (output.errors ?? []).filter((item) => item.severity === "error");
assert.equal(errors.length, 0, errors.map((item) => item.formattedMessage).join("\n"));
const remix = output.contracts[file][name];
const runtimeHash = runtimeFingerprint(artifact.deployedBytecode);
assert.equal(runtimeFingerprint("0x" + remix.evm.deployedBytecode.object), runtimeHash,
  "Flattened Remix runtime differs from the tested contract.");
assert.deepEqual(remix.abi, artifact.abi);
const sizes = [(artifact.deployedBytecode.length - 2) / 2, remix.evm.deployedBytecode.object.length / 2];
assert.ok(Math.max(...sizes) <= 24576, "Runtime exceeds Ethereum's 24,576-byte limit.");
mkdirSync("deployment", { recursive: true });
mkdirSync("src/generated", { recursive: true });
writeFileSync("deployment/" + file, flattened);
writeFileSync("src/generated/nightTokenV2.json",
  '{\n  "runtimeHash": "' + runtimeHash + '",\n  "abi": [\n' +
  artifact.abi.map((entry) => "    " + JSON.stringify(entry)).join(",\n") + "\n  ]\n}\n");
console.log("Remix source: deployment/" + file);
console.log("Verified Hardhat and Remix runtime sizes: " + sizes.join(" / ") + " bytes (limit 24,576).");
console.log("Executable runtime fingerprint: " + runtimeHash);
