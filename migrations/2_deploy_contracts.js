// ============ Contracts ============

// Token
// deployed first
// const MarmaladeToken = artifacts.require("MarmaladeToken");

const Factory = artifacts.require("MarmaladeToken");

// ============ Main Migration ============

const migration = async (deployer, network, accounts) => {
  await Promise.all([
    // deployToken(deployer, network),
    deployFactory(deployer, network),
  ]);
};

module.exports = migration;

// ============ Deploy Functions ============


async function deployToken(deployer, network) {
  await deployer.deploy(MarmaladeToken);
  if (network != "mainnet") {
    // await deployer.deploy(YAMProxy,
    //   "YAM",
    //   "YAM",
    //   18,
    //   "9000000000000000000000000", // print extra few mil for user
    //   YAMImplementation.address,
    //   "0x"
    // );
  } else {
    // await deployer.deploy(YAMProxy,
    //   "YAM",
    //   "YAM",
    //   18,
    //   "2000000000000000000000000",
    //   YAMImplementation.address,
    //   "0x"
    // );
  }

}

async function deployFactory(deployer, network) {
  await deployer.deploy(Factory);
  if (network != "mainnet") {
    // this.gulp.address, this.syrupbar.address, this.dev.address, "0", 1000
    await deployer.deploy(Factory,
      "0xb313319c6cdc6cb23beaa8cb501aecb2c0602ae3",
      "0x2ab9f805219e02cff560abdff1e3d58fa55c6dfe",
      "0x1D5c57053e306D97B3CA014Ca1deBd2882b325eD",
      "8877300",
      200
    );
  } else {
    // await deployer.deploy(YAMProxy,
    //   "YAM",
    //   "YAM",
    //   18,
    //   "2000000000000000000000000",
    //   YAMImplementation.address,
    //   "0x"
    // );
  }

}