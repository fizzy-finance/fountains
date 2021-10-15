const { ethers } = require("hardhat");

const { BigNumber } = ethers;

const advanceBlock = async () => {
    return ethers.provider.send("evm_mine", [])
}
exports.advanceBlock = advanceBlock

exports.advanceBlockTo = async (blockNumber) => {
    for (let i = await ethers.provider.getBlockNumber(); i < blockNumber; i++) {
        await advanceBlock()
    }
}

exports.currentBlockNumber = async () => {
    return await ethers.provider.getBlockNumber();
}