import { getBytes, keccak256 } from "ethers";

// Solidity appends a length-prefixed CBOR metadata trailer. The executable code
// is identical for the checked Hardhat and flattened Remix builds.
export function runtimeFingerprint(bytecode: string) {
  const bytes = getBytes(bytecode);
  if (bytes.length < 4) throw new Error("Missing Solidity runtime bytecode.");
  const length = bytes[bytes.length - 2] * 256 + bytes[bytes.length - 1];
  const start = bytes.length - length - 2;
  if (start <= 0 || length < 1 || bytes[start] < 0xa0 || bytes[start] >= 0xc0) {
    throw new Error("Missing Solidity bytecode metadata.");
  }
  return keccak256(bytes.slice(0, start));
}
