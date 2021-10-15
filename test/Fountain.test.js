const { ethers } = require("hardhat");
const { expect } = require("chai");
const { advanceBlockTo, advanceBlock, currentBlockNumber } = require("./helpers/time.js");
const { BigNumber } = ethers;

const gulpPerBlock = [
  100,
  95,
  90,
  85,
  81,
  77,
  73,
  69,
  66,
  63,
  60,
  57,
  54,
  51,
  48,
  46,
  44,
  42,
  39,
  37,
  36,
  34,
  32,
  30,
  29,
  27,
  26,
  25,
  23,
  22,
  21,
  20,
  19,
  18,
  17,
  16,
  15,
  15,
  14,
  13,
  13,
  12,
  11,
  11,
  10,
  10,
  9,
  9,
  8,
  8
]
describe("Fountain", function () {
  before(async function () {
    this.signers = await ethers.getSigners()
    this.alice = this.signers[0]
    this.bob = this.signers[1]
    this.carol = this.signers[2]
    this.dev = this.signers[3]
    this.minter = this.signers[4]

    this.Fountain = await ethers.getContractFactory("Fountain")
    this.GulpToken = await ethers.getContractFactory("GulpToken")
    this.ERC20Mock = await ethers.getContractFactory("ERC20Mock", this.minter)
  })

  context("should be deployed correctly", function () {
    beforeEach(async function () {
      this.gulp = await this.GulpToken.deploy()
      await this.gulp.deployed()
    })

    it("should set correct state variables", async function () {
      this.fountain = await this.Fountain.deploy(this.gulp.address, this.dev.address, "0", 1000, gulpPerBlock)
      await this.fountain.deployed()

      await this.gulp.transferOwnership(this.fountain.address)

      const sushi = await this.fountain.gulp()
      const devaddr = await this.fountain.devaddr()
      const owner = await this.gulp.owner()

      expect(sushi).to.equal(this.gulp.address)
      expect(devaddr).to.equal(this.dev.address)
      expect(owner).to.equal(this.fountain.address)
    })

    it("should allow dev and only dev to update dev", async function () {
      this.fountain = await this.Fountain.deploy(this.gulp.address, this.dev.address, "0", 1000, gulpPerBlock)
      await this.fountain.deployed()

      expect(await this.fountain.devaddr()).to.equal(this.dev.address)

      await expect(this.fountain.connect(this.bob).dev(this.bob.address, { from: this.bob.address })).to.be.revertedWith("dev: wut?")

      await this.fountain.connect(this.dev).dev(this.bob.address, { from: this.dev.address })

      expect(await this.fountain.devaddr()).to.equal(this.bob.address)

      await this.fountain.connect(this.bob).dev(this.alice.address, { from: this.bob.address })

      expect(await this.fountain.devaddr()).to.equal(this.alice.address)
    })
  })

  context("With ERC/LP token added to the field", function () {
    beforeEach(async function () {
      this.gulp = await this.GulpToken.deploy()
      await this.gulp.deployed()

      this.lp = await this.ERC20Mock.deploy("LPToken", "LP", "10000000000")
      await this.lp.transfer(this.alice.address, "1000")
      await this.lp.transfer(this.bob.address, "1000")
      await this.lp.transfer(this.carol.address, "1000")

      this.lp2 = await this.ERC20Mock.deploy("LPToken2", "LP2", "10000000000")
      await this.lp2.transfer(this.alice.address, "1000")
      await this.lp2.transfer(this.bob.address, "1000")
      await this.lp2.transfer(this.carol.address, "1000")

      this.lp3 = await this.ERC20Mock.deploy("LPToken3", "LP3", "10000000000")
      await this.lp3.transfer(this.alice.address, "1000")
      await this.lp3.transfer(this.bob.address, "1000")
      await this.lp3.transfer(this.carol.address, "1000")
    })

    it("should allow emergency withdraw", async function () {
      // 100 per block farming rate starting at block 100 with bonus until block 1000
      this.fountain = await this.Fountain.deploy(this.gulp.address, this.dev.address, "100", 1000, gulpPerBlock)
      await this.fountain.deployed()

      await this.fountain.add("100", this.lp.address)

      await this.lp.connect(this.bob).approve(this.fountain.address, "1000")

      await this.fountain.connect(this.bob).deposit(0, "100")

      expect(await this.lp.balanceOf(this.bob.address)).to.equal("900")

      await this.fountain.connect(this.bob).emergencyWithdraw(0)

      expect(await this.lp.balanceOf(this.bob.address)).to.equal("1000")
    })

    it("should give out GULPs only after farming time", async function () {
      // 100 per block farming rate starting at block 100 with bonus until block 1000
      this.fountain = await this.Fountain.deploy(this.gulp.address, this.dev.address, "100", 1000, gulpPerBlock)
      await this.fountain.deployed()
      // poolInfo.push(PoolInfo({
      //   lpToken: _gulp,
      //   allocPoint: 1000,
      //   lastRewardBlock: startBlock,
      //   accGulpPerShare: 0
      // }));

      // totalAllocPoint = 1000;

      await this.gulp.transferOwnership(this.fountain.address)

      await this.fountain.add("100", this.lp.address)
      await this.fountain.set(0, "75", true)
      await this.fountain.add("25", this.lp2.address)
      // totalAllocPoint = 1100
      // poolInfo = [
      //   lpToken: _gulp,
      //   allocPoint: 1000,
      //   lastRewardBlock: startBlock,
      //   accGulpPerShare: 0
      // },
      // {
      //   lpToken: _lpToken,
      //   allocPoint: 100,
      //   lastRewardBlock: 100,
      //   accGulpPerShare: 0
      // }];
      // totalAllocPoint = totalAllocPoint.sub(1000).add(100 / 3) = 133
      // poolInfo[0].allocPoint = 33

      expect(await this.fountain.totalAllocPoint()).to.equal(100)

      await this.lp.connect(this.bob).approve(this.fountain.address, "1000")
      await this.fountain.connect(this.bob).deposit(0, "100")
      await advanceBlockTo("89")

      await this.fountain.connect(this.bob).deposit(0, "0") // block 90
      expect(await this.gulp.balanceOf(this.bob.address)).to.equal("0")
      await advanceBlockTo("94")

      await this.fountain.connect(this.bob).deposit(0, "0") // block 95
      expect(await this.gulp.balanceOf(this.bob.address)).to.equal("0")
      await advanceBlockTo("99")

      await this.fountain.connect(this.bob).deposit(0, "0") // block 100
      expect(await this.gulp.balanceOf(this.bob.address)).to.equal("0")
      await advanceBlockTo("100")

      await this.fountain.connect(this.bob).deposit(0, "0") // block 101
      expect(await this.gulp.balanceOf(this.bob.address)).to.equal("75")

      await advanceBlockTo("104")
      await this.fountain.connect(this.bob).deposit(0, "0") // block 105

      expect(await this.gulp.balanceOf(this.bob.address)).to.equal("375")
      expect(await this.gulp.balanceOf(this.dev.address)).to.equal("37")
      expect(await this.gulp.totalSupply()).to.equal("412")
    })

    it("should not distribute GULPs if no one deposit", async function () {
      // 100 per block farming rate starting at block 200 with bonus until block 1000
      cbn = await currentBlockNumber()
      this.fountain = await this.Fountain.deploy(this.gulp.address, this.dev.address, cbn + 200, 1000, gulpPerBlock)
      await this.fountain.deployed()
      await this.gulp.transferOwnership(this.fountain.address)

      await this.fountain.add("75", this.lp.address)
      await this.fountain.add("25", this.lp2.address)
      await this.lp.connect(this.bob).approve(this.fountain.address, "1000")
      await advanceBlockTo(cbn + 199)
      expect(await this.gulp.totalSupply()).to.equal("0")
      await advanceBlockTo(cbn + 204)
      expect(await this.gulp.totalSupply()).to.equal("0")
      await advanceBlockTo(cbn + 209)
      await this.fountain.connect(this.bob).deposit(0, "10") // block 210
      expect(await this.gulp.totalSupply()).to.equal("0")
      expect(await this.gulp.balanceOf(this.bob.address)).to.equal("0")
      expect(await this.gulp.balanceOf(this.dev.address)).to.equal("0")
      expect(await this.lp.balanceOf(this.bob.address)).to.equal("990")
      await advanceBlockTo(cbn + 219)
      await this.fountain.connect(this.bob).withdraw(0, "10") // block 220
      expect(await this.gulp.totalSupply()).to.equal("825")
      expect(await this.gulp.balanceOf(this.bob.address)).to.equal("750")
      expect(await this.gulp.balanceOf(this.dev.address)).to.equal("75")
      expect(await this.lp.balanceOf(this.bob.address)).to.equal("1000")
    })

    it("should distribute GULPs properly for each staker", async function () {
      // 100 per block farming rate starting at block 300 with bonus until block 1000
      cbn = await currentBlockNumber()

      this.fountain = await this.Fountain.deploy(this.gulp.address, this.dev.address, cbn + 300, 1000, gulpPerBlock)
      await this.fountain.deployed()
      await this.gulp.transferOwnership(this.fountain.address)

      await this.fountain.add("25", this.lp2.address)
      await this.fountain.add("75", this.lp.address)
      await this.lp.connect(this.alice).approve(this.fountain.address, "1000", {
        from: this.alice.address,
      })
      await this.lp.connect(this.bob).approve(this.fountain.address, "1000", {
        from: this.bob.address,
      })
      await this.lp.connect(this.carol).approve(this.fountain.address, "1000", {
        from: this.carol.address,
      })
      // Alice deposits 10 LPs at block 310
      await advanceBlockTo(cbn + 309)
      await this.fountain.connect(this.alice).deposit(1, "10", { from: this.alice.address })
      expect(await this.gulp.totalSupply()).to.equal("0")
      // Bob deposits 20 LPs at block 314
      await advanceBlockTo(cbn + 313)
      await this.fountain.connect(this.bob).deposit(1, "20", { from: this.bob.address })
      expect(await this.gulp.totalSupply()).to.equal("330") // 75*4 + 75*10%*4
      // Carol deposits 30 LPs at block 318
      await advanceBlockTo(cbn + 317)
      await this.fountain.connect(this.carol).deposit(1, "30", { from: this.carol.address })
      expect(await this.gulp.totalSupply()).to.equal("660") // 75*4 + 75*10%*4
      // Alice deposits 10 more LPs at block 320. At this point:
      //   Alice should have: 4*75 + 4*1/3*75 + 2*1/6*75 = 5666
      //   Fountain should have the remaining: 10000 - 5666 = 4334
      // 300 + 100 + 50
      await advanceBlockTo(cbn + 319)
      await this.fountain.connect(this.alice).deposit(1, "10", { from: this.alice.address })
      expect(await this.gulp.totalSupply()).to.equal("825")
      expect(await this.gulp.balanceOf(this.alice.address)).to.equal("425")
      expect(await this.gulp.balanceOf(this.bob.address)).to.equal("0")
      expect(await this.gulp.balanceOf(this.carol.address)).to.equal("0")
      expect(await this.gulp.balanceOf(this.dev.address)).to.equal("75")
      // Bob withdraws 5 LPs at block 330. At this point:
      //   Bob should have: 4*2/3*75 + 2*2/6*75 + 10*2/7*75 = 464
      await advanceBlockTo(cbn + 329)
      await this.fountain.connect(this.bob).withdraw(1, "5", { from: this.bob.address })
      expect(await this.gulp.totalSupply()).to.equal("1650")
      expect(await this.gulp.balanceOf(this.alice.address)).to.equal("425")
      expect(await this.gulp.balanceOf(this.bob.address)).to.equal("464")
      expect(await this.gulp.balanceOf(this.carol.address)).to.equal("0")
      expect(await this.gulp.balanceOf(this.dev.address)).to.equal("150")
      // Alice withdraws 20 LPs at block 340.
      // Bob withdraws 15 LPs at block 350.
      // Carol withdraws 30 LPs at block 360.
      await advanceBlockTo(cbn + 339)
      await this.fountain.connect(this.alice).withdraw(1, "20", { from: this.alice.address })
      await advanceBlockTo(cbn + 349)
      await this.fountain.connect(this.bob).withdraw(1, "15", { from: this.bob.address })
      await advanceBlockTo(cbn + 359)
      await this.fountain.connect(this.carol).withdraw(1, "30", { from: this.carol.address })
      expect(await this.gulp.totalSupply()).to.equal("4125")
      expect(await this.gulp.balanceOf(this.dev.address)).to.equal("375")
      // Alice should have: 425 + 10*2/7*75 + 10*2/6.5*75 = 425 + 214 + 230 -> round up
      expect(await this.gulp.balanceOf(this.alice.address)).to.equal("870")
      // Bob should have: 464 + 10*1.5/6.5 * 75 + 10*1.5/4.5*75 = 887
      expect(await this.gulp.balanceOf(this.bob.address)).to.equal("887")
      // Carol should have: 2*3/6*75 + 10*3/7*75=321 + 10*3/6.5*75=346 + 10*3/4.5*75 + 10*75 = 1992
      expect(await this.gulp.balanceOf(this.carol.address)).to.equal("1992")
      // All of them should have 1000 LPs back.
      expect(await this.lp.balanceOf(this.alice.address)).to.equal("1000")
      expect(await this.lp.balanceOf(this.bob.address)).to.equal("1000")
      expect(await this.lp.balanceOf(this.carol.address)).to.equal("1000")
    })

    it("should give proper GULPs allocation to each pool", async function () {
      // 100 per block farming rate starting at block 400 with bonus until block 1000
      cbn = await currentBlockNumber()

      this.fountain = await this.Fountain.deploy(this.gulp.address, this.dev.address, cbn + 400, 1000, gulpPerBlock)
      await this.gulp.transferOwnership(this.fountain.address)
      await this.lp.connect(this.alice).approve(this.fountain.address, "1000", { from: this.alice.address })
      await this.lp2.connect(this.bob).approve(this.fountain.address, "1000", { from: this.bob.address })
      
      await this.fountain.add("100", this.lp.address)
      // Alice deposits 10 LPs at block 410
      await advanceBlockTo(cbn + 409)
      await this.fountain.connect(this.alice).deposit(0, "10", { from: this.alice.address })
      // Add LP2 to the pool with allocation 2 at block 420
      await advanceBlockTo(cbn + 419)
      await this.fountain.add("200", this.lp2.address)
      // Alice should have 10*100 pending reward
      expect(await this.fountain.pendingGulp(0, this.alice.address)).to.equal("1000")
      // Bob deposits 10 LP2s at block 425
      await advanceBlockTo(cbn + 424)
      await this.fountain.connect(this.bob).deposit(1, "5", { from: this.bob.address })
      // Alice should have 1000 + 5*1/3*100 = 1500 pending reward
      expect(await this.fountain.pendingGulp(0, this.alice.address)).to.equal("1166")
      expect(await this.fountain.pendingGulp(1, this.alice.address)).to.equal("0")
      await advanceBlockTo(cbn + 430)
      // At block 430. Bob should get 5*2/3*75 = 250. Alice should get ~125 more.
      expect(await this.fountain.pendingGulp(0, this.alice.address)).to.equal("1333")
      expect(await this.fountain.pendingGulp(1, this.bob.address)).to.equal("333")
    })

    it('real case 1', async function () {
      cbn = await currentBlockNumber()
      this.fountain = await this.Fountain.deploy(this.gulp.address, this.dev.address, cbn + 100, 1000, gulpPerBlock)
      await this.gulp.transferOwnership(this.fountain.address)
  
      this.lp1 = await this.ERC20Mock.deploy('LPToken', 'LP1', '1000000');
      this.lp2 = await this.ERC20Mock.deploy('LPToken', 'LP2', '1000000');
      this.lp3 = await this.ERC20Mock.deploy('LPToken', 'LP3', '1000000');
  
      await this.lp1.transfer(this.bob.address, '2000');
      await this.lp2.transfer(this.bob.address, '2000');
      await this.lp3.transfer(this.bob.address, '2000');
  
      await this.lp1.transfer(this.alice.address, '2000');
      await this.lp2.transfer(this.alice.address, '2000');
      await this.lp3.transfer(this.alice.address, '2000');
      this.lp4 = await this.ERC20Mock.deploy('LPToken', 'LP1', '1000000');
      this.lp5 = await this.ERC20Mock.deploy('LPToken', 'LP2', '1000000');
      this.lp6 = await this.ERC20Mock.deploy('LPToken', 'LP3', '1000000');
      this.lp7 = await this.ERC20Mock.deploy('LPToken', 'LP1', '1000000');
      this.lp8 = await this.ERC20Mock.deploy('LPToken', 'LP2', '1000000');
      this.lp9 = await this.ERC20Mock.deploy('LPToken', 'LP3', '1000000');
  
      await this.fountain.add('2000', this.lp1.address);
      await this.fountain.add('1000', this.lp2.address);
      await this.fountain.add('500', this.lp3.address);
      await this.fountain.add('500', this.lp3.address);
      await this.fountain.add('500', this.lp3.address);
      await this.fountain.add('500', this.lp3.address);
      await this.fountain.add('500', this.lp3.address);
      await this.fountain.add('100', this.lp3.address);
      await this.fountain.add('100', this.lp3.address);
      assert.equal((await this.fountain.poolLength()).toString(), "9");
  
      await advanceBlockTo(cbn + 170)
      await this.lp1.connect(this.alice).approve(this.fountain.address, '1000');
      assert.equal((await this.gulp.balanceOf(this.alice.address)).toString(), '0');
      await this.fountain.connect(this.alice).deposit(0, '20');
      await this.fountain.connect(this.alice).withdraw(0, '20');
      assert.equal((await this.gulp.balanceOf(this.alice.address)).toString(), '35');
    })

    it('changes rewards every gulpRewardChangeBlocks blocks', async function () {
      cbn = await currentBlockNumber()
      this.fountain = await this.Fountain.deploy(this.gulp.address, this.dev.address, cbn + 100, 500, gulpPerBlock)
      await this.gulp.transferOwnership(this.fountain.address)
  
      this.lp1 = await this.ERC20Mock.deploy('LPToken', 'LP1', '1000000');
      this.lp2 = await this.ERC20Mock.deploy('LPToken', 'LP2', '1000000');
  
      await this.lp1.transfer(this.bob.address, '2000');
      await this.lp2.transfer(this.bob.address, '2000');
  
      await this.lp1.transfer(this.alice.address, '2000');
      await this.lp2.transfer(this.alice.address, '2000');
  
      await this.fountain.add('2000', this.lp1.address);
      await this.fountain.add('1000', this.lp2.address);
      assert.equal((await this.fountain.poolLength()).toString(), "2");

      await this.lp1.connect(this.alice).approve(this.fountain.address, '1000');
      await this.lp1.connect(this.bob).approve(this.fountain.address, '1000');
      await this.lp2.connect(this.alice).approve(this.fountain.address, '1000');
      await this.lp2.connect(this.bob).approve(this.fountain.address, '1000');
      
      await this.fountain.connect(this.bob).deposit(0, "1000")
      await this.fountain.connect(this.alice).deposit(0, "500")
      await this.fountain.connect(this.alice).deposit(1, "100")

      await advanceBlockTo(cbn + 100)

      await this.fountain.connect(this.alice).deposit(0, "0")
      expect(await this.gulp.balanceOf(this.alice.address)).to.equal("22")
      await this.fountain.connect(this.alice).deposit(0, "0")
      expect(await this.gulp.balanceOf(this.alice.address)).to.equal("44")

      await advanceBlockTo(cbn + 109) // 10 - 1 because deposit will mine 1 block

      await this.fountain.connect(this.alice).deposit(0, "0")
      expect(await this.gulp.balanceOf(this.alice.address)).to.equal("221")

      await advanceBlockTo(cbn + 599)
      await this.fountain.connect(this.alice).deposit(0, "0")
      expect(await this.gulp.balanceOf(this.alice.address)).to.equal("11110")
      await this.fountain.connect(this.alice).deposit(0, "0")
      expect(await this.gulp.balanceOf(this.alice.address)).to.equal("11131") // new block reward = 47; 47 / (1000 + 500) * 500 = 15.6
      await this.fountain.connect(this.alice).deposit(1, "0")
      expect(await this.gulp.balanceOf(this.alice.address)).to.equal("27860") // 500 * 1/3 * 100 + 2 * 1/3 * 95

      // await advanceBlockTo(cbn + 100 + 500*51 - 1)
      // await this.fountain.connect(this.alice).deposit(1, "0")
      // expect(await this.gulp.balanceOf(this.alice.address)).to.equal("8333")
    })

    it('stops distributing rewards after the last window', async function () {
      cbn = await currentBlockNumber()
      this.fountain = await this.Fountain.deploy(this.gulp.address, this.dev.address, cbn + 100, 50, gulpPerBlock)
      await this.gulp.transferOwnership(this.fountain.address)
  
      this.lp1 = await this.ERC20Mock.deploy('LPToken', 'LP1', '1000000');
      this.lp2 = await this.ERC20Mock.deploy('LPToken', 'LP2', '1000000');
  
      await this.lp1.transfer(this.bob.address, '2000');
      await this.lp2.transfer(this.bob.address, '2000');
  
      await this.lp1.transfer(this.alice.address, '2000');
      await this.lp2.transfer(this.alice.address, '2000');
  
      await this.fountain.add('2000', this.lp1.address);
      await this.fountain.add('1000', this.lp2.address);
      assert.equal((await this.fountain.poolLength()).toString(), "2");

      await this.lp1.connect(this.alice).approve(this.fountain.address, '1000');
      await this.lp1.connect(this.bob).approve(this.fountain.address, '1000');
      await this.lp2.connect(this.alice).approve(this.fountain.address, '1000');
      await this.lp2.connect(this.bob).approve(this.fountain.address, '1000');
      
      await this.fountain.connect(this.bob).deposit(0, "1000")
      await this.fountain.connect(this.alice).deposit(0, "500")

      await advanceBlockTo(cbn + 100)
      await this.fountain.connect(this.alice).deposit(0, "0")
      expect(await this.gulp.balanceOf(this.alice.address)).to.equal("22")

      // let gwa = [100, 95, 90, 85, 81, 77, 73, 69, 66, 63, 60, 57, 54, 51, 48, 46, 44, 42, 39, 37, 36, 34, 32, 30, 29,
      //   27, 26, 25, 23, 22, 21, 20, 19, 18, 17, 16, 15, 15, 14, 13, 13, 12, 11, 11, 10, 10, 9, 9, 8, 8]

      // advance through several blocks
      await advanceBlockTo(cbn + 299)
      await this.fountain.connect(this.alice).deposit(0, "0")
      // let acc = BigNumber.from(0)
      // const precision = BigNumber.from("1000000000000")
      // for (i=0; i<4; i++) {
      //   let reward = BigNumber.from(gwa[i])
      //   reward = reward.mul(precision)
      //   reward = reward.mul(2).div(3) // for the pool 0
      //   reward = reward.div(3) // for alice LP
      //   acc = acc.add(reward.mul(50))
      // }
      expect(await this.gulp.balanceOf(this.alice.address)).to.equal("4110")

      // advance through all blocks
      await advanceBlockTo(cbn + 100 + 50*51 - 1)
      await this.fountain.connect(this.alice).deposit(0, "0")
      
      // acc = BigNumber.from(0)
      // for (i=0; i<50; i++) {
      //   let reward = BigNumber.from(gwa[i])
      //   reward = reward.mul(precision)
      //   reward = reward.div(2) // for the pool 1
      //   reward = reward.div(3) // for alice LP
      //   acc = acc.add(reward.mul(50))
      // }

      expect(await this.gulp.balanceOf(this.alice.address)).to.equal(20328)
      expect(await this.gulp.balanceOf(this.dev.address)).to.equal(6097)

      // further advance does not distribute rewards
      await advanceBlockTo(cbn + 100 + 50*60 - 1)
      await this.fountain.connect(this.alice).deposit(0, "0")
      expect(await this.gulp.balanceOf(this.alice.address)).to.equal(20328)
      expect(await this.gulp.balanceOf(this.dev.address)).to.equal(6097)
    })

    it('stops distributing rewards after the farm is shut down', async function () {
      cbn = await currentBlockNumber()
      this.fountain = await this.Fountain.deploy(this.gulp.address, this.dev.address, cbn + 100, 100, gulpPerBlock)
      await this.fountain.deployed()
      await this.gulp.transferOwnership(this.fountain.address)

      await this.fountain.add("100", this.lp.address)
      await this.fountain.set(0, "75", true)
      await this.fountain.add("25", this.lp2.address)
      expect(await this.fountain.totalAllocPoint()).to.equal(100)

      await this.lp.connect(this.bob).approve(this.fountain.address, "1000")
      await this.fountain.connect(this.bob).deposit(0, "100")
      await advanceBlockTo(cbn + 100)

      await this.fountain.connect(this.bob).deposit(0, "0") // block 101
      expect(await this.gulp.balanceOf(this.bob.address)).to.equal("75")

      await advanceBlockTo(cbn + 104)
      await this.fountain.connect(this.bob).deposit(0, "0") // block 105

      expect(await this.gulp.balanceOf(this.bob.address)).to.equal("375")
      expect(await this.gulp.balanceOf(this.dev.address)).to.equal("37")
      expect(await this.gulp.totalSupply()).to.equal("412")

      await this.fountain.set(0, "0", true)
      await this.fountain.connect(this.bob).deposit(0, "0") // block 110
      expect(await this.gulp.balanceOf(this.bob.address)).to.equal("450")

      await advanceBlockTo(cbn + 109)
      await this.fountain.connect(this.bob).deposit(0, "0") // block 110
      // bob stopped accumulating gulp even though he is still staking LPs
      expect(await this.gulp.balanceOf(this.bob.address)).to.equal("450")
      expect(await this.gulp.balanceOf(this.dev.address)).to.equal("44")
      expect(await this.gulp.totalSupply()).to.equal("494")

      await this.fountain.connect(this.bob).withdraw(0, "100")
      await this.fountain.connect(this.bob).deposit(0, "0")
      expect(await this.gulp.balanceOf(this.bob.address)).to.equal("450")
      await this.fountain.connect(this.bob).deposit(0, "0")
      expect(await this.gulp.balanceOf(this.bob.address)).to.equal("450")

    })
  })
})