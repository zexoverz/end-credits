// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20Errors} from "openzeppelin-contracts/interfaces/draft-IERC6093.sol";
import {EndCreditsBudget} from "../src/EndCreditsBudget.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract EndCreditsBudgetTest is Test {
    EndCreditsBudget internal budget;
    MockUSDC internal usdc;

    address internal owner = makeAddr("owner");
    address internal otherOwner = makeAddr("otherOwner");
    address internal agent = makeAddr("agent");
    address internal otherAgent = makeAddr("otherAgent");

    uint128 internal constant CAP = 5_000_000; // 5 USDC a day
    uint64 internal constant DAY = 1 days;
    uint256 internal constant START = 1_000_000_000; // 1,000 USDC
    uint256 internal constant T0 = 1_790_000_000;

    function setUp() public {
        vm.warp(T0);
        usdc = new MockUSDC();
        budget = new EndCreditsBudget(usdc);
        usdc.mint(owner, START);
        vm.prank(owner);
        usdc.approve(address(budget), type(uint256).max);
    }

    function _allow(uint128 cap, uint64 period) internal {
        vm.prank(owner);
        budget.setAllowance(agent, cap, period);
    }

    function _pull(uint256 amount) internal {
        vm.prank(agent);
        budget.pull(owner, amount);
    }

    // ---------------------------------------------------------------- setAllowance guards

    function test_setAllowance_revertsOnZeroSpender() public {
        vm.expectRevert(abi.encodeWithSelector(EndCreditsBudget.ZeroSpender.selector));
        vm.prank(owner);
        budget.setAllowance(address(0), CAP, DAY);
    }

    function test_setAllowance_revertsOnZeroAmount() public {
        vm.expectRevert(abi.encodeWithSelector(EndCreditsBudget.ZeroAmount.selector));
        vm.prank(owner);
        budget.setAllowance(agent, 0, DAY);
    }

    function test_setAllowance_revertsOnPeriodTooShort() public {
        uint64 period = 1 hours - 1;
        vm.expectRevert(abi.encodeWithSelector(EndCreditsBudget.PeriodOutOfRange.selector, period));
        vm.prank(owner);
        budget.setAllowance(agent, CAP, period);
    }

    function test_setAllowance_revertsOnPeriodTooLong() public {
        uint64 period = 30 days + 1;
        vm.expectRevert(abi.encodeWithSelector(EndCreditsBudget.PeriodOutOfRange.selector, period));
        vm.prank(owner);
        budget.setAllowance(agent, CAP, period);
    }

    function test_setAllowance_acceptsPeriodBounds() public {
        _allow(CAP, 1 hours);
        assertEq(budget.allowanceOf(owner, agent).period, 1 hours);
        _allow(CAP, 30 days);
        assertEq(budget.allowanceOf(owner, agent).period, 30 days);
    }

    // ---------------------------------------------------------------- pull guards

    function test_pull_revertsWithoutAllowance() public {
        vm.expectRevert(abi.encodeWithSelector(EndCreditsBudget.NoAllowance.selector, owner, agent));
        _pull(1);
    }

    function test_pull_revertsOnZeroAmount() public {
        _allow(CAP, DAY);
        vm.expectRevert(abi.encodeWithSelector(EndCreditsBudget.ZeroAmount.selector));
        _pull(0);
    }

    function test_pull_revertsOverCapWithRemaining() public {
        _allow(CAP, DAY);
        _pull(2_000_000);
        vm.expectRevert(abi.encodeWithSelector(EndCreditsBudget.OverPeriodCap.selector, uint256(3_000_000)));
        _pull(3_000_001);
    }

    function test_pull_revertsOverCapOnFirstPull() public {
        _allow(CAP, DAY);
        vm.expectRevert(abi.encodeWithSelector(EndCreditsBudget.OverPeriodCap.selector, uint256(CAP)));
        _pull(uint256(CAP) + 1);
    }

    function test_pull_revertsOnHugeAmountWithoutOverflow() public {
        _allow(CAP, DAY);
        _pull(1);
        vm.expectRevert(abi.encodeWithSelector(EndCreditsBudget.OverPeriodCap.selector, uint256(CAP) - 1));
        _pull(type(uint256).max);
    }

    function test_pull_revertsAfterRevoke() public {
        _allow(CAP, DAY);
        _pull(1_000_000);
        vm.prank(owner);
        budget.revoke(agent);
        vm.expectRevert(abi.encodeWithSelector(EndCreditsBudget.NoAllowance.selector, owner, agent));
        _pull(1);
    }

    function test_pull_revertsForOtherSpender() public {
        _allow(CAP, DAY);
        vm.expectRevert(abi.encodeWithSelector(EndCreditsBudget.NoAllowance.selector, owner, otherAgent));
        vm.prank(otherAgent);
        budget.pull(owner, 1);
    }

    function test_pull_revertsFromOwnerWhoNeverSetOne() public {
        _allow(CAP, DAY);
        usdc.mint(otherOwner, START);
        vm.prank(otherOwner);
        usdc.approve(address(budget), type(uint256).max);

        vm.expectRevert(abi.encodeWithSelector(EndCreditsBudget.NoAllowance.selector, otherOwner, agent));
        vm.prank(agent);
        budget.pull(otherOwner, 1);
    }

    function test_pull_revertsWithoutUsdcApproval() public {
        vm.prank(owner);
        usdc.approve(address(budget), 999_999);
        _allow(CAP, DAY);
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientAllowance.selector, address(budget), 999_999, 1_000_000
            )
        );
        _pull(1_000_000);
        assertEq(budget.remaining(owner, agent), CAP);
    }

    function test_pull_revertsWithoutUsdcBalance() public {
        address poor = makeAddr("poor");
        usdc.mint(poor, 10);
        vm.startPrank(poor);
        usdc.approve(address(budget), type(uint256).max);
        budget.setAllowance(agent, CAP, DAY);
        vm.stopPrank();

        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, poor, 10, 11));
        vm.prank(agent);
        budget.pull(poor, 11);
    }

    // ---------------------------------------------------------------- setAllowance and revoke

    function test_setAllowance_storesAndEmits() public {
        vm.expectEmit(true, true, true, true, address(budget));
        emit EndCreditsBudget.AllowanceSet(owner, agent, CAP, DAY);
        _allow(CAP, DAY);

        EndCreditsBudget.Allowance memory a = budget.allowanceOf(owner, agent);
        assertEq(a.perPeriod, CAP);
        assertEq(a.period, DAY);
        assertEq(a.periodStart, T0);
        assertEq(a.spentInPeriod, 0);
        assertEq(budget.remaining(owner, agent), CAP);
    }

    function test_setAllowance_loweringCapKeepsSpent() public {
        _allow(CAP, DAY);
        _pull(3_000_000);
        skip(1 hours);

        _allow(2_000_000, DAY);

        EndCreditsBudget.Allowance memory a = budget.allowanceOf(owner, agent);
        assertEq(a.spentInPeriod, 3_000_000);
        assertEq(a.periodStart, T0);
        assertEq(budget.remaining(owner, agent), 0);
        vm.expectRevert(abi.encodeWithSelector(EndCreditsBudget.OverPeriodCap.selector, uint256(0)));
        _pull(1);
    }

    function test_setAllowance_raisingCapKeepsWindow() public {
        _allow(CAP, DAY);
        _pull(CAP);
        skip(1 hours);

        _allow(CAP + 1_000_000, DAY);

        assertEq(budget.allowanceOf(owner, agent).periodStart, T0);
        assertEq(budget.remaining(owner, agent), 1_000_000);
        _pull(1_000_000);
        vm.expectRevert(abi.encodeWithSelector(EndCreditsBudget.OverPeriodCap.selector, uint256(0)));
        _pull(1);
    }

    function test_setAllowance_periodChangeResets() public {
        _allow(CAP, DAY);
        _pull(CAP);
        skip(1 hours);

        _allow(CAP, 7 days);

        EndCreditsBudget.Allowance memory a = budget.allowanceOf(owner, agent);
        assertEq(a.period, 7 days);
        assertEq(a.periodStart, T0 + 1 hours);
        assertEq(a.spentInPeriod, 0);
        assertEq(budget.remaining(owner, agent), CAP);
    }

    function test_setAllowance_afterRevokeStartsFresh() public {
        _allow(CAP, DAY);
        _pull(CAP);
        vm.prank(owner);
        budget.revoke(agent);
        skip(1 hours);

        _allow(CAP, DAY);

        EndCreditsBudget.Allowance memory a = budget.allowanceOf(owner, agent);
        assertEq(a.periodStart, T0 + 1 hours);
        assertEq(a.spentInPeriod, 0);
    }

    function test_revoke_deletesAndEmits() public {
        _allow(CAP, DAY);
        _pull(1_000_000);

        vm.expectEmit(true, true, true, true, address(budget));
        emit EndCreditsBudget.AllowanceRevoked(owner, agent);
        vm.prank(owner);
        budget.revoke(agent);

        EndCreditsBudget.Allowance memory a = budget.allowanceOf(owner, agent);
        assertEq(a.perPeriod, 0);
        assertEq(a.period, 0);
        assertEq(a.periodStart, 0);
        assertEq(a.spentInPeriod, 0);
        assertEq(budget.remaining(owner, agent), 0);
    }

    function test_revoke_onlyTouchesCallersAllowance() public {
        _allow(CAP, DAY);
        vm.prank(otherOwner);
        budget.revoke(agent);
        assertEq(budget.allowanceOf(owner, agent).perPeriod, CAP);
        _pull(1);
    }

    // ---------------------------------------------------------------- pull

    function test_pull_movesFundsWithinCap() public {
        _allow(CAP, DAY);

        vm.expectEmit(true, true, true, true, address(budget));
        emit EndCreditsBudget.Pulled(owner, agent, 2_000_000, 2_000_000, uint64(T0));
        _pull(2_000_000);

        assertEq(usdc.balanceOf(agent), 2_000_000);
        assertEq(usdc.balanceOf(owner), START - 2_000_000);
        assertEq(usdc.balanceOf(address(budget)), 0);
        assertEq(budget.allowanceOf(owner, agent).spentInPeriod, 2_000_000);
        assertEq(budget.remaining(owner, agent), 3_000_000);
    }

    function test_pull_exactCapThenNothingLeft() public {
        _allow(CAP, DAY);
        _pull(2_000_000);
        _pull(3_000_000);
        assertEq(budget.remaining(owner, agent), 0);
        vm.expectRevert(abi.encodeWithSelector(EndCreditsBudget.OverPeriodCap.selector, uint256(0)));
        _pull(1);
    }

    function test_pull_windowEdge() public {
        _allow(CAP, DAY);
        _pull(CAP);

        vm.warp(T0 + DAY - 1);
        assertEq(budget.remaining(owner, agent), 0);
        vm.expectRevert(abi.encodeWithSelector(EndCreditsBudget.OverPeriodCap.selector, uint256(0)));
        _pull(1);

        vm.warp(T0 + DAY);
        assertEq(budget.remaining(owner, agent), CAP);
        _pull(1);
        assertEq(budget.allowanceOf(owner, agent).periodStart, T0 + DAY);
    }

    function test_pull_rollsAfterOnePeriod() public {
        _allow(CAP, DAY);
        _pull(CAP);
        vm.warp(T0 + DAY + 5 hours);

        vm.expectEmit(true, true, true, true, address(budget));
        emit EndCreditsBudget.Pulled(owner, agent, 1_000_000, 1_000_000, uint64(T0 + DAY));
        _pull(1_000_000);

        EndCreditsBudget.Allowance memory a = budget.allowanceOf(owner, agent);
        assertEq(a.periodStart, T0 + DAY);
        assertEq(a.spentInPeriod, 1_000_000);
        assertEq(usdc.balanceOf(agent), CAP + 1_000_000);
    }

    function test_pull_rollsAfterSeveralPeriodsWithoutDrift() public {
        _allow(CAP, DAY);
        _pull(CAP);
        vm.warp(T0 + 4 * DAY + 23 hours);

        _pull(CAP);

        // Start stays on the day grid of the first window, not at the pull time.
        assertEq(budget.allowanceOf(owner, agent).periodStart, T0 + 4 * DAY);
        vm.expectRevert(abi.encodeWithSelector(EndCreditsBudget.OverPeriodCap.selector, uint256(0)));
        _pull(1);

        // One hour later the next day's window opens, on the same grid.
        vm.warp(T0 + 5 * DAY);
        _pull(CAP);
        assertEq(budget.allowanceOf(owner, agent).periodStart, T0 + 5 * DAY);
    }

    function test_remaining_accountsForRolledWindow() public {
        _allow(CAP, DAY);
        _pull(CAP);
        vm.warp(T0 + 3 * DAY + 1);
        assertEq(budget.remaining(owner, agent), CAP);
        // The view does not write: storage still holds the old window.
        EndCreditsBudget.Allowance memory a = budget.allowanceOf(owner, agent);
        assertEq(a.periodStart, T0);
        assertEq(a.spentInPeriod, CAP);
    }

    function test_remaining_zeroWithoutAllowance() public view {
        assertEq(budget.remaining(owner, agent), 0);
    }

    function test_pull_allowancesAreSeparatePerSpender() public {
        _allow(CAP, DAY);
        vm.prank(owner);
        budget.setAllowance(otherAgent, 1_000_000, DAY);

        _pull(CAP);
        vm.prank(otherAgent);
        budget.pull(owner, 1_000_000);

        assertEq(usdc.balanceOf(agent), CAP);
        assertEq(usdc.balanceOf(otherAgent), 1_000_000);
        vm.expectRevert(abi.encodeWithSelector(EndCreditsBudget.OverPeriodCap.selector, uint256(0)));
        vm.prank(otherAgent);
        budget.pull(owner, 1);
    }

    // ---------------------------------------------------------------- fuzz

    /// Random pulls at random times: the sum pulled in any one window never exceeds the cap, and
    /// the windows stay on the grid of the first one.
    function testFuzz_pullsInOneWindowNeverExceedCap(uint128 cap, uint64 period, uint256 seed) public {
        cap = uint128(bound(cap, 1, 1e12));
        period = uint64(bound(period, 1 hours, 30 days));
        usdc.mint(owner, 1e15);
        _allow(cap, period);

        uint256 lastWindow;
        uint256 pulledInWindow;
        for (uint256 i; i < 40; i++) {
            seed = uint256(keccak256(abi.encode(seed, i)));
            skip(seed % (uint256(period) / 2 + 1));
            uint256 window = (block.timestamp - T0) / period;
            if (window != lastWindow) {
                lastWindow = window;
                pulledInWindow = 0;
            }

            uint256 amount = bound(seed >> 64, 1, uint256(cap) * 2);
            vm.prank(agent);
            try budget.pull(owner, amount) {
                pulledInWindow += amount;
                assertEq(budget.allowanceOf(owner, agent).periodStart, T0 + window * period);
            } catch {
                assertGt(pulledInWindow + amount, cap);
            }
            assertLe(pulledInWindow, cap);
            assertEq(budget.remaining(owner, agent), cap - pulledInWindow);
        }
        assertEq(usdc.balanceOf(address(budget)), 0);
    }
}
