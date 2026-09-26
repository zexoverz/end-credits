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
}
