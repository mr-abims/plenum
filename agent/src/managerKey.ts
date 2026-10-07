// Prints the manager's data-room public key for NEXT_PUBLIC_MANAGER_ENC_PUBKEY. Usage: MANAGER_ENC_SEED=0x… pnpm manager-key
import { hexToBytes, type Hex } from "viem";
import { deriveEncryptionKey, publicKeyToBytes32 } from "@plenum/crypto";

const seed = process.env.MANAGER_ENC_SEED;
if (!seed || !/^0x[0-9a-fA-F]{64}$/.test(seed)) throw new Error("set MANAGER_ENC_SEED to a 32-byte hex secret");
console.log(publicKeyToBytes32(deriveEncryptionKey(hexToBytes(seed as Hex)).publicKey));
