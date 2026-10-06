import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { RPC_PORT, RPC_URL } from "./harness.ts";

const CONTRACTS = join(import.meta.dirname, "../../contracts");
let anvil: ChildProcess | undefined;

async function waitForRpc(url: string, tries = 50) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      });
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`anvil did not start on ${url}`);
}

/** Local chain with the full Plenum deployment and the Balanced rehearsal plenum (contracts/script). */
export default async function setup() {
  anvil = spawn("anvil", ["--port", String(RPC_PORT), "--silent"], { stdio: "ignore" });
  await waitForRpc(RPC_URL);
  const env = { ...process.env, FOUNDRY_DISABLE_NIGHTLY_WARNING: "1" };
  for (const script of ["script/Deploy.s.sol", "script/Rehearsal.s.sol"]) {
    execFileSync("forge", ["script", script, "--rpc-url", RPC_URL, "--broadcast", "--slow"], {
      cwd: CONTRACTS,
      env,
      stdio: "pipe",
    });
  }
  return async () => {
    anvil?.kill();
  };
}
