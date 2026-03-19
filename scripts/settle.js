const { ethers } = require("hardhat");
const ROUTER = process.env.ROUTER_ADDRESS || "0x211eB3d0b75F05A65D6006d7CC5Cf9CC94f6aF7d";
async function main() {
  const router = await ethers.getContractAt("ShieldXRouter", ROUTER);
  const epoch = await router.getCurrentEpoch();
  console.log("Current epoch:", epoch.id.toString(), "settled:", epoch.settled);
  if (!epoch.settled) {
    const tx = await router.settleEpoch(epoch.id, { gasLimit: 2000000 });
    const r = await tx.wait();
    console.log("Settled epoch", epoch.id.toString(), "tx:", r.hash);
  } else {
    console.log("Already settled.");
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
