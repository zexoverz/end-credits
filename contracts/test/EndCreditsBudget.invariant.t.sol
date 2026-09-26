// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {CommonBase} from "forge-std/Base.sol";
import {StdCheats} from "forge-std/StdCheats.sol";
import {StdUtils} from "forge-std/StdUtils.sol";
import {EndCreditsBudget} from "../src/EndCreditsBudget.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

/// Drives the budget with random calls and keeps its own model of every allowance, written from the
/// rules rather than from the contract, to compare against.
contract BudgetHandler is CommonBase, StdCheats, StdUtils {
    struct Model {
        uint128 cap;
        uint64 period;
        uint64 start;
        uint128 spent;
        uint128 maxCapInWindow;
    }

    EndCreditsBudget internal budget;
    MockUSDC internal usdc;

    address[2] public owners = [address(0xA1), address(0xA2)];
    address[2] public spenders = [address(0xB1), address(0xB2)];
    uint64[3] internal periods = [uint64(1 hours), uint64(1 days), uint64(7 days)];

    mapping(address => mapping(address => Model)) internal models;
    uint256 public ghostPulled;
    bool public violated;
    mapping(bytes32 => uint256) public calls;

    constructor(EndCreditsBudget budget_, MockUSDC usdc_) {
        budget = budget_;
        usdc = usdc_;
        for (uint256 i; i < 2; i++) {
            usdc.mint(owners[i], 1e18);
            vm.prank(owners[i]);
            usdc.approve(address(budget), type(uint256).max);
        }
    }

    function setAllowance(uint256 ownerSeed, uint256 spenderSeed, uint256 cap, uint256 periodSeed) external {
        address owner = owners[ownerSeed % 2];
        address spender = spenders[spenderSeed % 2];
        uint128 cap128 = uint128(bound(cap, 1, 1e12));
        uint64 period = periods[periodSeed % 3];

        vm.prank(owner);
        budget.setAllowance(spender, cap128, period);

        Model storage m = models[owner][spender];
        if (m.cap == 0 || m.period != period) {
            m.period = period;
            m.start = uint64(block.timestamp);
            m.spent = 0;
            m.maxCapInWindow = cap128;
        } else if (cap128 > m.maxCapInWindow) {
            m.maxCapInWindow = cap128;
        }
        m.cap = cap128;
        calls["setAllowance"]++;
    }

    function revoke(uint256 ownerSeed, uint256 spenderSeed) external {
        address owner = owners[ownerSeed % 2];
        address spender = spenders[spenderSeed % 2];
        vm.prank(owner);
        budget.revoke(spender);
        delete models[owner][spender];
        calls["revoke"]++;
    }

    function pull(uint256 ownerSeed, uint256 spenderSeed, uint256 amount) external {
        address owner = owners[ownerSeed % 2];
        address spender = spenders[spenderSeed % 2];
        Model storage m = models[owner][spender];

        if (m.cap == 0) {
            vm.prank(spender);
            try budget.pull(owner, 1) {
                violated = true;
            } catch {}
            return;
        }

        if (block.timestamp >= uint256(m.start) + m.period) {
            m.start += uint64((block.timestamp - m.start) / m.period) * m.period;
            m.spent = 0;
            m.maxCapInWindow = m.cap;
        }
        uint256 left = m.cap > m.spent ? m.cap - m.spent : 0;
        amount = bound(amount, 1, left * 2 + 1);

        vm.prank(spender);
        try budget.pull(owner, amount) {
            if (amount > left) violated = true;
            m.spent += uint128(amount);
            ghostPulled += amount;
            if (m.spent > m.maxCapInWindow) violated = true;
            EndCreditsBudget.Allowance memory a = budget.allowanceOf(owner, spender);
            if (a.periodStart != m.start || a.spentInPeriod != m.spent) violated = true;
            calls["pull"]++;
        } catch {
            if (amount <= left) violated = true;
            calls["pullRejected"]++;
        }
    }

    function warp(uint256 secs) external {
        skip(bound(secs, 0, 3 days));
    }

    function modelRemaining(address owner, address spender) external view returns (uint256) {
        Model memory m = models[owner][spender];
        if (m.cap == 0) return 0;
        if (block.timestamp >= uint256(m.start) + m.period) return m.cap;
        return m.cap > m.spent ? m.cap - m.spent : 0;
    }
}

contract EndCreditsBudgetInvariantTest is StdInvariant, Test {
    EndCreditsBudget internal budget;
    MockUSDC internal usdc;
    BudgetHandler internal handler;

    function setUp() public {
        vm.warp(1_790_000_000);
        usdc = new MockUSDC();
        budget = new EndCreditsBudget(usdc);
        handler = new BudgetHandler(budget, usdc);

        bytes4[] memory selectors = new bytes4[](4);
        selectors[0] = BudgetHandler.setAllowance.selector;
        selectors[1] = BudgetHandler.revoke.selector;
        selectors[2] = BudgetHandler.pull.selector;
        selectors[3] = BudgetHandler.warp.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
        targetContract(address(handler));
    }

    function invariant_contractHoldsNoUsdc() public view {
        assertEq(usdc.balanceOf(address(budget)), 0);
    }

    function invariant_spendersHoldExactlyWhatWasPulled() public view {
        assertEq(usdc.balanceOf(handler.spenders(0)) + usdc.balanceOf(handler.spenders(1)), handler.ghostPulled());
    }

    function invariant_pullsMatchTheModel() public view {
        assertFalse(handler.violated());
    }

    function invariant_remainingMatchesTheModel() public view {
        for (uint256 i; i < 2; i++) {
            for (uint256 j; j < 2; j++) {
                address o = handler.owners(i);
                address s = handler.spenders(j);
                assertEq(budget.remaining(o, s), handler.modelRemaining(o, s));
            }
        }
    }
}
