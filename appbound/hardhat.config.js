
import "@nomicfoundation/hardhat-toolbox";
module.exports = {
  solidity: "0.8.21",
  networks: {
    hardhat: {},
    localhost: { url: "http://127.0.0.1:8545" }
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  }
};
