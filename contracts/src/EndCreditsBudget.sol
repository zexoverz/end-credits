// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/token/ERC20/utils/SafeERC20.sol";

/// @title EndCreditsBudget
/// @notice Spend limits on the owner's own USDC. The owner approves this contract on USDC and gives
/// a spender (the server's agent key) an allowance of `perPeriod` per `period`. The spender can pull
/// at most that much per window, straight from the owner to itself; the contract never holds funds.
/// The owner can lower, change or revoke the allowance at any time. No admin, no upgrades.
contract EndCreditsBudget {
    using SafeERC20 for IERC20;

    struct Allowance {
        uint128 perPeriod;
        uint64 period;
        uint64 periodStart;
        uint128 spentInPeriod;
    }

    uint64 public constant MIN_PERIOD = 1 hours;
    uint64 public constant MAX_PERIOD = 30 days;

    IERC20 public immutable usdc;

    mapping(address owner => mapping(address spender => Allowance)) public allowances;

    event AllowanceSet(address indexed owner, address indexed spender, uint128 perPeriod, uint64 period);
    event AllowanceRevoked(address indexed owner, address indexed spender);
    event Pulled(
        address indexed owner, address indexed spender, uint256 amount, uint128 spentInPeriod, uint64 periodStart
    );

    error ZeroSpender();
    error ZeroAmount();
    error PeriodOutOfRange(uint64 period);
    error NoAllowance(address owner, address spender);
    error OverPeriodCap(uint256 remaining);

    constructor(IERC20 usdc_) {
        usdc = usdc_;
    }

    /// @notice Let `spender` pull up to `perPeriod` of the caller's USDC per `period` seconds. A new
    /// allowance, or a change of period length, starts a fresh window now. Changing only the cap
    /// keeps the current window and what was spent in it, so lowering the cap cannot be used to
    /// reset the spent amount.
    function setAllowance(address spender, uint128 perPeriod, uint64 period) external {
        if (spender == address(0)) revert ZeroSpender();
        if (period < MIN_PERIOD || period > MAX_PERIOD) revert PeriodOutOfRange(period);
        if (perPeriod == 0) revert ZeroAmount();

        Allowance storage a = allowances[msg.sender][spender];
        // A missing allowance has period 0, which is never a valid period, so this also covers it.
        if (a.period != period) {
            a.period = period;
            a.periodStart = uint64(block.timestamp);
            a.spentInPeriod = 0;
        }
        a.perPeriod = perPeriod;

        emit AllowanceSet(msg.sender, spender, perPeriod, period);
    }

    /// @notice Remove `spender`'s allowance on the caller's USDC.
    function revoke(address spender) external {
        delete allowances[msg.sender][spender];
        emit AllowanceRevoked(msg.sender, spender);
    }

    /// @notice Move `amount` of `owner`'s USDC to the caller, within the caller's allowance for the
    /// current window. `owner` must have approved this contract on USDC for at least `amount`.
    function pull(address owner, uint256 amount) external {
        Allowance storage a = allowances[owner][msg.sender];
        if (a.perPeriod == 0) revert NoAllowance(owner, msg.sender);
        if (amount == 0) revert ZeroAmount();

        (uint64 start, uint128 spent) = _window(a);
        uint256 left = _left(a.perPeriod, spent);
        if (amount > left) revert OverPeriodCap(left);

        spent += uint128(amount);
        a.periodStart = start;
        a.spentInPeriod = spent;

        emit Pulled(owner, msg.sender, amount, spent, start);
        usdc.safeTransferFrom(owner, msg.sender, amount);
    }

    /// @notice What `spender` can still pull from `owner` in the current window.
    function remaining(address owner, address spender) external view returns (uint256) {
        Allowance storage a = allowances[owner][spender];
        if (a.perPeriod == 0) return 0;
        (, uint128 spent) = _window(a);
        return _left(a.perPeriod, spent);
    }

    /// @notice The stored allowance, without rolling an elapsed window forward.
    function allowanceOf(address owner, address spender) external view returns (Allowance memory) {
        return allowances[owner][spender];
    }

    /// @dev The current window. Once a window has ended the start moves forward by whole periods,
    /// so window edges never drift from the first one, and the spent amount starts again at zero.
    function _window(Allowance storage a) internal view returns (uint64 start, uint128 spent) {
        start = a.periodStart;
        spent = a.spentInPeriod;
        uint64 period = a.period;
        if (block.timestamp >= uint256(start) + period) {
            start += uint64((block.timestamp - start) / period) * period;
            spent = 0;
        }
    }

    /// @dev Spent can exceed the cap after the owner lowers it; nothing is left then.
    function _left(uint128 perPeriod, uint128 spent) internal pure returns (uint256) {
        return perPeriod > spent ? perPeriod - spent : 0;
    }
}
