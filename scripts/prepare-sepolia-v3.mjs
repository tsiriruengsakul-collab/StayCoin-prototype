import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import solc from "solc";
import { runtimeFingerprint } from "../src/runtimeCode.ts";

assert.match(solc.version(), /^0\.8\.28\+/);
mkdirSync("deployment", { recursive: true });
mkdirSync("src/generated", { recursive: true });
for (const [name, manifest] of [["MockTHB", "mockTHB"], ["StayCoinNightTokenV3", "nightTokenV3"]]) {
  const file = name + ".sol";
  const source = "contracts/" + file;
  const artifact = JSON.parse(readFileSync("artifacts/" + source + "/" + name + ".json", "utf8"));
  const content = execFileSync(process.execPath, ["node_modules/hardhat/dist/src/cli.js", "flatten", source], { encoding: "utf8" });
  const input = { language: "Solidity", sources: { [file]: { content } }, settings: {
    optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun",
    outputSelection: { "*": { "*": ["abi", "evm.deployedBytecode.object"] } },
  }};
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  assert.equal((output.errors ?? []).filter((error) => error.severity === "error").length, 0,
    (output.errors ?? []).map((error) => error.formattedMessage).join("\n"));
  const remix = output.contracts[file][name];
  const runtimeHash = runtimeFingerprint(artifact.deployedBytecode);
  const size = remix.evm.deployedBytecode.object.length / 2;
  assert.ok(size <= 24_576, "Ethereum runtime limit exceeded");
  assert.equal(runtimeFingerprint("0x" + remix.evm.deployedBytecode.object), runtimeHash);
  assert.deepEqual(remix.abi, artifact.abi);
  writeFileSync("deployment/" + file, content);
  writeFileSync("src/generated/" + manifest + ".json",
    '{\n  "runtimeHash": "' + runtimeHash + '",\n  "abi": [\n' +
    artifact.abi.map((item) => "    " + JSON.stringify(item)).join(",\n") + "\n  ]\n}\n");
  console.log("deployment/" + file + " · " + size + " bytes · " + runtimeHash);
}
