// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.6.12;

// remixd version: import "@openzeppelin/contracts@3.1.0/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./BoringMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./GulpToken.sol";
import "./SignedSafeMath.sol";

// import "@nomiclabs/buidler/console.sol";


interface IMigratorChef {
    // Perform LP token migration from legacy UniswapV2 to SushiSwap.
    // Take the current LP token address and return the new LP token address.
    // Migrator should have full access to the caller's LP token.
    // Return the new LP token address.
    //
    // XXX Migrator must have allowance access to UniswapV2 LP tokens.
    // SushiSwap must mint EXACTLY the same amount of SushiSwap LP tokens or
    // else something bad will happen. Traditional UniswapV2 does not
    // do that so be careful!
    function migrate(IERC20 token) external returns (IERC20);
}


contract Fountain is Ownable {
    using BoringMath for uint256;
    using SafeERC20 for IERC20;
    using BoringMath128 for uint128;
    using BoringMath64 for uint64;
    using SignedSafeMath for int256;

    // Info of each user.
    struct UserInfo {
        uint256 amount; // How many LP tokens the user has provided.
        int256 rewardDebt; // Reward debt. See explanation below.
        //
        // We do some fancy math here. Basically, any point in time, the amount of GULPs
        // entitled to a user but is pending to be distributed is:
        //
        //   pending reward = (user.amount * pool.accGulpPerShare) - user.rewardDebt
        //
        // Whenever a user deposits or withdraws LP tokens to a pool. Here's what happens:
        //   1. The pool's `accGulpPerShare` (and `lastRewardBlock`) gets updated.
        //   2. User receives the pending reward sent to his/her address.
        //   3. User's `amount` gets updated.
        //   4. User's `rewardDebt` gets updated.
    }

    // Info of each pool.
    struct PoolInfo {
        IERC20 lpToken; // Address of LP token contract.
        uint64 allocPoint; // How many allocation points assigned to this pool. GULPs to distribute per block.
        uint64 lastRewardBlock; // Last block number that GULPs distribution occurs.
        uint64 lastRewardWindow; // Last reward window used.
        uint128 accGulpPerShare; // Accumulated GULPs per share, times 1e12. See below.
    }

    GulpToken public gulp;

    // Dev address.
    address public devaddr;

    IMigratorChef public migrator;

    // GULP tokens created per block with change evry 170000 blocks (roughly a month)
    uint256[50] public gulpPerBlock = [
        10000000000000000000,
        9500000000000000000,
        9000000000000000000,
        8500000000000000000,
        8100000000000000000,
        7700000000000000000,
        7300000000000000000,
        6900000000000000000,
        6600000000000000000,
        6300000000000000000,
        6000000000000000000,
        5700000000000000000,
        5400000000000000000,
        5100000000000000000,
        4800000000000000000,
        4600000000000000000,
        4400000000000000000,
        4200000000000000000,
        3900000000000000000,
        3700000000000000000,
        3600000000000000000,
        3400000000000000000,
        3200000000000000000,
        3000000000000000000,
        2900000000000000000,
        2700000000000000000,
        2600000000000000000,
        2500000000000000000,
        2300000000000000000,
        2200000000000000000,
        2100000000000000000,
        2000000000000000000,
        1900000000000000000,
        1800000000000000000,
        1700000000000000000,
        1600000000000000000,
        1500000000000000000,
        1500000000000000000,
        1400000000000000000,
        1300000000000000000,
        1300000000000000000,
        1200000000000000000,
        1100000000000000000,
        1100000000000000000,
        1000000000000000000,
        1000000000000000000,
        900000000000000000,
        900000000000000000,
        800000000000000000,
        800000000000000000
    ];
    uint256[51] windowBlock; // +1 for closing

    // global var for the last pool update.
    // needed for adding new pools.
    uint64 public lastRewardWindow;

    uint64 public gulpRewardChangeBlocks = 1296000;

    // floating point precision
    uint256 private constant ACC_GULP_PRECISION = 1e12;

    // Info of each pool.
    PoolInfo[] public poolInfo;
    // Info of each user that stakes LP tokens.
    mapping(uint256 => mapping(address => UserInfo)) public userInfo;
    // Total allocation points. Must be the sum of all allocation points in all pools.
    uint256 public totalAllocPoint = 0;
    // The block number when GULP mining starts.
    uint256 public startBlock;

    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event EmergencyWithdraw(
        address indexed user,
        uint256 indexed pid,
        uint256 amount
    );

    constructor(
        GulpToken _gulp,
        address _devaddr,
        uint256 _startBlock
    ) public {
        gulp = _gulp;
        devaddr = _devaddr;
        startBlock = _startBlock;
        uint256 b = startBlock;
        for (uint256 i = 0; i <= 50; i++) {
            windowBlock[i] = b;
            b = b + gulpRewardChangeBlocks;
        }
    }

    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    function add(uint256 _allocPoint, IERC20 _lpToken) public onlyOwner {
        massUpdatePools();

        uint256 lastRewardBlock = block.number > startBlock
            ? block.number
            : startBlock;
        totalAllocPoint = totalAllocPoint.add(_allocPoint);
        poolInfo.push(
            PoolInfo({
                lpToken: _lpToken,
                allocPoint: _allocPoint.to64(),
                lastRewardBlock: lastRewardBlock.to64(),
                lastRewardWindow: lastRewardWindow, // updated in massUpdatePools
                accGulpPerShare: 0
            })
        );
    }

    // Update the given pool's GULP allocation point. Can only be called by the owner.
    function set(
        uint256 _pid,
        uint256 _allocPoint,
        bool _withUpdate
    ) public onlyOwner {
        if (_withUpdate) {
            massUpdatePools();
        }
        uint256 prevAllocPoint = poolInfo[_pid].allocPoint;
        poolInfo[_pid].allocPoint = _allocPoint.to64();
        if (prevAllocPoint != _allocPoint) {
            totalAllocPoint = totalAllocPoint.sub(prevAllocPoint).add(
                _allocPoint
            );
        }
    }

    function gulpPerBlockCalculated() internal view returns (uint256) {
        return gulpPerBlock[uint256(block.number / gulpRewardChangeBlocks)];
    }

    // View function to see pending GULPs on frontend.
    function pendingGulp(uint256 _pid, address _user)
        external
        view
        returns (uint256 pending)
    {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];
        uint256 accGulpPerShare = pool.accGulpPerShare;
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (block.number > pool.lastRewardBlock && lpSupply != 0) {
            (uint256 gulpReward, ) = getGulpRewardForPool(pool);
            accGulpPerShare = accGulpPerShare.add(
                gulpReward.mul(1e12) / lpSupply
            );
        }
        pending = int256(user.amount.mul(accGulpPerShare) / ACC_GULP_PRECISION)
            .sub(user.rewardDebt)
            .toUInt256();
    }

    // Update reward variables for all pools. Be careful of gas spending!
    function massUpdatePools() public {
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            updatePool(pid);
        }
    }

    function getGulpRewardForPool(PoolInfo memory pool)
        internal
        view
        returns (uint256 gulpReward, uint64 rewardWindow)
    {
        // todo return if alloc point is zero
        if (pool.lastRewardBlock >= windowBlock[pool.lastRewardWindow + 1]) {
            return (0, pool.lastRewardWindow);
        }

        rewardWindow = pool.lastRewardWindow;
        gulpReward = 0;

        while (rewardWindow < 50 && windowBlock[rewardWindow] <= block.number) {
            uint256 rightBoundary;
            uint256 leftBoundary;

            if (block.number >= windowBlock[rewardWindow + 1]) {
                rightBoundary = windowBlock[rewardWindow + 1];
            } else {
                rightBoundary = block.number;
            }

            if (pool.lastRewardBlock < windowBlock[rewardWindow]) {
                leftBoundary = windowBlock[rewardWindow];
            } else {
                leftBoundary = pool.lastRewardBlock;
            }

            gulpReward +=
                rightBoundary
                    .sub(leftBoundary)
                    .mul(gulpPerBlock[rewardWindow])
                    .mul(pool.allocPoint) /
                totalAllocPoint;

            rewardWindow++;
        }
        rewardWindow--;
    }

    // Update reward variables of the given pool to be up-to-date.
    function updatePool(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        if (block.number <= pool.lastRewardBlock) {
            return;
        }
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (lpSupply == 0) {
            pool.lastRewardBlock = block.number.to64();
            return;
        }
        uint256 gulpReward;
        (gulpReward, lastRewardWindow) = getGulpRewardForPool(pool);
        if (gulpReward > 0) {
            gulp.mint(devaddr, gulpReward / 10);
            gulp.mint(address(this), gulpReward);

            pool.accGulpPerShare = pool.accGulpPerShare.add(
                (gulpReward.mul(ACC_GULP_PRECISION) / lpSupply).to128()
            );
        }
        pool.lastRewardBlock = block.number.to64();
        pool.lastRewardWindow = lastRewardWindow;
    }

    // Deposit LP tokens to Fountain for GULP allocation.
    function deposit(uint256 _pid, uint256 _amount) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        updatePool(_pid);
        if (user.amount > 0) {
            // uint256 pending =  user.amount.mul(pool.accGulpPerShare / ACC_GULP_PRECISION).sub(user.rewardDebt);
            uint256 pending = (user.amount.mul(pool.accGulpPerShare) /
                ACC_GULP_PRECISION).sub(uint256(user.rewardDebt));

            if (pending > 0) {
                safeGulpTransfer(msg.sender, pending);
            }
        }
        if (_amount > 0) {
            pool.lpToken.safeTransferFrom(
                address(msg.sender),
                address(this),
                _amount
            );
            user.amount = user.amount.add(_amount);
        }
        user.rewardDebt = int256(user.amount.mul(pool.accGulpPerShare) / 1e12);
        emit Deposit(msg.sender, _pid, _amount);
    }

    // Withdraw LP tokens from MasterChef.
    function withdraw(uint256 _pid, uint256 _amount) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        require(user.amount >= _amount, "withdraw: not good");

        updatePool(_pid);
        uint256 pending = (user.amount.mul(pool.accGulpPerShare) / 1e12).sub(
            uint256(user.rewardDebt)
        );
        if (pending > 0) {
            safeGulpTransfer(msg.sender, pending);
        }
        if (_amount > 0) {
            user.amount = user.amount.sub(_amount);
            pool.lpToken.safeTransfer(address(msg.sender), _amount);
        }
        user.rewardDebt = int256(user.amount.mul(pool.accGulpPerShare) / 1e12);
        emit Withdraw(msg.sender, _pid, _amount);
    }

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        pool.lpToken.safeTransfer(address(msg.sender), user.amount);
        emit EmergencyWithdraw(msg.sender, _pid, user.amount);
        user.amount = 0;
        user.rewardDebt = 0;
    }

    // Safe gulp transfer function, just in case if rounding error causes pool to not have enough GULPs.
    function safeGulpTransfer(address _to, uint256 _amount) internal {
        uint256 gulpBal = gulp.balanceOf(address(this));
        if (_amount > gulpBal) {
            gulp.transfer(_to, gulpBal);
        } else {
            gulp.transfer(_to, _amount);
        }
    }

    // Update dev address by the previous dev.
    function dev(address _devaddr) public {
        require(msg.sender == devaddr, "dev: wut?");
        devaddr = _devaddr;
    }

    // Set the migrator contract. Can only be called by the owner.
    function setMigrator(IMigratorChef _migrator) public onlyOwner {
        migrator = _migrator;
    }

    // Migrate lp token to another lp contract. Can be called by anyone. We trust that migrator contract is good.
    function migrate(uint256 _pid) public {
        require(address(migrator) != address(0), "migrate: no migrator");
        PoolInfo storage pool = poolInfo[_pid];
        IERC20 lpToken = pool.lpToken;
        uint256 bal = lpToken.balanceOf(address(this));
        lpToken.safeApprove(address(migrator), bal);
        IERC20 newLpToken = migrator.migrate(lpToken);
        require(bal == newLpToken.balanceOf(address(this)), "migrate: bad");
        pool.lpToken = newLpToken;
    }
}
