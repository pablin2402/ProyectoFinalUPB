const { Wallet } = require("ethers");

function getAddress() {
  return Wallet.fromPhrase(process.env.MNEMONIC).address;
}

module.exports = { getAddress };
