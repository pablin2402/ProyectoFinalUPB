const hre = require("hardhat");

async function main() {
  const Payment = await hre.ethers.getContractFactory("Payment");
  const payment = await Payment.deploy();

  await payment.deploymentTransaction().wait();

}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
