const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying ShieldX Protocol with account:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "PAS\n");

  // Step 1: Deploy MockShieldXEngine
  const Engine = await ethers.getContractFactory("MockShieldXEngine");
  const engine = await Engine.deploy();
  await engine.waitForDeployment();
  const engineAddr = await engine.getAddress();
  console.log("1. MockShieldXEngine deployed:", engineAddr);

  // Step 2: Deploy ShieldXVault (treasury = deployer)
  const Vault = await ethers.getContractFactory("ShieldXVault");
  const vault = await Vault.deploy(deployer.address);
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log("2. ShieldXVault deployed:", vaultAddr);

  // Step 3: Deploy ShieldXSettlement (engineAddress = step 1)
  const Settlement = await ethers.getContractFactory("ShieldXSettlement");
  const settlement = await Settlement.deploy(engineAddr);
  await settlement.waitForDeployment();
  const settlementAddr = await settlement.getAddress();
  console.log("3. ShieldXSettlement deployed:", settlementAddr);

  // Step 4: Deploy ShieldXRouter
  const Router = await ethers.getContractFactory("ShieldXRouter");
  const router = await Router.deploy(
    30,                            // 30s epochs for testnet
    30,                            // 30s reveal window
    ethers.parseEther("0.01"),     // 0.01 PAS min collateral
    vaultAddr,
    settlementAddr
  );
  await router.waitForDeployment();
  const routerAddr = await router.getAddress();
  console.log("4. ShieldXRouter deployed:", routerAddr);

  // Step 5: Deploy ShieldXExecutor
  const Executor = await ethers.getContractFactory("ShieldXExecutor");
  const executor = await Executor.deploy();
  await executor.waitForDeployment();
  const executorAddr = await executor.getAddress();
  console.log("5. ShieldXExecutor deployed:", executorAddr);

  // Step 6: Wire vault.setRouter(router)
  let tx = await vault.setRouter(routerAddr);
  await tx.wait();
  console.log("6. vault.setRouter() done");

  // Step 7: Wire settlement.setRouter(router)
  tx = await settlement.setRouter(routerAddr);
  await tx.wait();
  console.log("7. settlement.setRouter() done");

  // Step 8: Wire settlement.setXcmExecutor(executor)
  tx = await settlement.setXcmExecutor(executorAddr);
  await tx.wait();
  console.log("8. settlement.setXcmExecutor() done");

  // Step 9: Wire executor.setRouter(router)
  tx = await executor.setRouter(routerAddr);
  await tx.wait();
  console.log("9. executor.setRouter() done");

  // Verification
  const epoch = await router.getCurrentEpoch();
  console.log("\nVerification — Current Epoch:", {
    id: epoch.id.toString(),
    startTime: epoch.startTime.toString(),
    endTime: epoch.endTime.toString(),
    status: epoch.status.toString(),
  });

  console.log("\n=== ShieldX Protocol Deployed ===");
  console.log("MockShieldXEngine:", engineAddr);
  console.log("ShieldXVault:     ", vaultAddr);
  console.log("ShieldXSettlement:", settlementAddr);
  console.log("ShieldXRouter:    ", routerAddr);
  console.log("ShieldXExecutor:  ", executorAddr);
  console.log("================================\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
