// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {EndCreditsEscrow} from "../src/EndCreditsEscrow.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract EndCreditsEscrowTest is Test {
    EndCreditsEscrow internal escrow;
    MockUSDC internal usdc;

    address internal recorder = makeAddr("recorder");
    address internal payer = makeAddr("payer");
    address internal payee = makeAddr("payee");
    address internal stranger = makeAddr("stranger");
    address internal maintainerA = makeAddr("maintainerA");
    address internal maintainerB = makeAddr("maintainerB");

    uint64 internal constant DELAY = 3 days;
    uint64 internal constant TTL = 1 days;
    uint256 internal constant AMOUNT = 250_000; // 0.25 USDC
    uint256 internal constant START = 1_000_000_000_000; // 1M USDC
    uint8 internal constant REASON = 2;

    bytes32 internal constant TIP = keccak256("tip-1");
    bytes32 internal constant SESSION = keccak256("session-1");
    bytes32 internal constant APPROVAL = keccak256("approval-nonce-1");
    bytes32 internal constant EVIDENCE = keccak256("funding-json-pr-1");
    bytes32 internal PKG = keccak256(abi.encodePacked("npm:", "@endcredits-demo/left-pad"));

    function setUp() public {
        vm.warp(1_790_000_000);
        usdc = new MockUSDC();
        escrow = new EndCreditsEscrow(usdc, recorder, DELAY);
        usdc.mint(payer, START);
        vm.prank(payer);
        usdc.approve(address(escrow), type(uint256).max);
    }

    function _hold() internal returns (uint64 expiresAt) {
        expiresAt = uint64(block.timestamp) + TTL;
        vm.prank(payer);
        escrow.hold(TIP, PKG, payee, AMOUNT, REASON, TTL);
    }

    function _status(bytes32 tipId) internal view returns (EndCreditsEscrow.TipStatus) {
        return escrow.tipOf(tipId).status;
    }

    // ---------------------------------------------------------------- hold

    function test_hold_pullsFundsAndEmits() public {
        uint64 expiresAt = uint64(block.timestamp) + TTL;
        vm.expectEmit(true, true, true, true, address(escrow));
        emit EndCreditsEscrow.Held(TIP, PKG, payer, payee, AMOUNT, REASON, expiresAt);

        vm.prank(payer);
        escrow.hold(TIP, PKG, payee, AMOUNT, REASON, TTL);

        assertEq(usdc.balanceOf(address(escrow)), AMOUNT);
        assertEq(usdc.balanceOf(payer), START - AMOUNT);
        assertEq(escrow.totalPending(), AMOUNT);

        EndCreditsEscrow.Tip memory t = escrow.tipOf(TIP);
        assertEq(t.payer, payer);
        assertEq(t.payee, payee);
        assertEq(t.packageKey, PKG);
        assertEq(t.amount, AMOUNT);
        assertEq(t.expiresAt, expiresAt);
        assertEq(uint8(t.status), uint8(EndCreditsEscrow.TipStatus.Pending));
    }

    function test_hold_revertsOnZeroAmount() public {
        vm.expectRevert(abi.encodeWithSelector(EndCreditsEscrow.ZeroAmount.selector));
        vm.prank(payer);
        escrow.hold(TIP, PKG, payee, 0, REASON, TTL);
    }

    function test_hold_revertsOnZeroPayee() public {
        vm.expectRevert(abi.encodeWithSelector(EndCreditsEscrow.ZeroPayee.selector));
        vm.prank(payer);
        escrow.hold(TIP, PKG, address(0), AMOUNT, REASON, TTL);
    }

    function test_hold_revertsOnDuplicateTip() public {
        _hold();
        vm.expectRevert(abi.encodeWithSelector(EndCreditsEscrow.TipExists.selector, TIP));
        vm.prank(payer);
        escrow.hold(TIP, PKG, stranger, AMOUNT, REASON, TTL);
    }

    function test_hold_revertsOnTtlOutOfRange() public {
        uint64 below = escrow.MIN_TTL() - 1;
        vm.expectRevert(abi.encodeWithSelector(EndCreditsEscrow.TtlOutOfRange.selector, below));
        vm.prank(payer);
        escrow.hold(TIP, PKG, payee, AMOUNT, REASON, below);

        uint64 above = escrow.MAX_TTL() + 1;
        vm.expectRevert(abi.encodeWithSelector(EndCreditsEscrow.TtlOutOfRange.selector, above));
        vm.prank(payer);
        escrow.hold(TIP, PKG, payee, AMOUNT, REASON, above);
    }

    function test_hold_acceptsTtlBounds() public {
        vm.startPrank(payer);
        escrow.hold(keccak256("min"), PKG, payee, AMOUNT, REASON, escrow.MIN_TTL());
        escrow.hold(keccak256("max"), PKG, payee, AMOUNT, REASON, escrow.MAX_TTL());
        vm.stopPrank();
        assertEq(escrow.totalPending(), 2 * AMOUNT);
    }

    // ------------------------------------------------------------- release

    function test_release_paysFixedPayee() public {
        _hold();
        vm.expectEmit(true, true, true, true, address(escrow));
        emit EndCreditsEscrow.Released(TIP, payee, AMOUNT, APPROVAL);

        vm.prank(recorder);
        escrow.release(TIP, APPROVAL);

        assertEq(usdc.balanceOf(payee), AMOUNT);
        assertEq(usdc.balanceOf(recorder), 0);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(escrow.totalPending(), 0);
        assertEq(uint8(_status(TIP)), uint8(EndCreditsEscrow.TipStatus.Released));
    }

    function test_release_revertsForNonRecorder() public {
        _hold();
        vm.expectRevert(abi.encodeWithSelector(EndCreditsEscrow.NotRecorder.selector));
        vm.prank(payee);
        escrow.release(TIP, APPROVAL);

        vm.expectRevert(abi.encodeWithSelector(EndCreditsEscrow.NotRecorder.selector));
        vm.prank(payer);
        escrow.release(TIP, APPROVAL);
    }

    function test_release_revertsAfterExpiry() public {
        uint64 expiresAt = _hold();
        vm.warp(expiresAt);
        vm.expectRevert(abi.encodeWithSelector(EndCreditsEscrow.TipExpired.selector, TIP));
        vm.prank(recorder);
        escrow.release(TIP, APPROVAL);
    }

    function test_release_succeedsJustBeforeExpiry() public {
        uint64 expiresAt = _hold();
        vm.warp(expiresAt - 1);
        vm.prank(recorder);
        escrow.release(TIP, APPROVAL);
        assertEq(usdc.balanceOf(payee), AMOUNT);
    }

    function test_release_revertsTwice() public {
        _hold();
        vm.startPrank(recorder);
        escrow.release(TIP, APPROVAL);
        vm.expectRevert(abi.encodeWithSelector(EndCreditsEscrow.NotPending.selector, TIP));
        escrow.release(TIP, APPROVAL);
        vm.stopPrank();
    }

    function test_release_revertsAfterRefund() public {
        _hold();
        vm.startPrank(recorder);
        escrow.refund(TIP);
        vm.expectRevert(abi.encodeWithSelector(EndCreditsEscrow.NotPending.selector, TIP));
        escrow.release(TIP, APPROVAL);
        vm.stopPrank();
    }

    function test_release_revertsForUnknownTip() public {
        vm.expectRevert(abi.encodeWithSelector(EndCreditsEscrow.NotPending.selector, TIP));
        vm.prank(recorder);
        escrow.release(TIP, APPROVAL);
    }

    // -------------------------------------------------------------- refund

    function test_refund_byRecorderBeforeExpiry() public {
        _hold();
        vm.expectEmit(true, true, true, true, address(escrow));
        emit EndCreditsEscrow.Refunded(TIP, payer, AMOUNT, false);

        vm.prank(recorder);
        escrow.refund(TIP);

        assertEq(usdc.balanceOf(payer), START);
        assertEq(usdc.balanceOf(payee), 0);
        assertEq(escrow.totalPending(), 0);
        assertEq(uint8(_status(TIP)), uint8(EndCreditsEscrow.TipStatus.Refunded));
    }

    function test_refund_revertsForStrangerBeforeExpiry() public {
        uint64 expiresAt = _hold();
        vm.warp(expiresAt - 1);
        vm.expectRevert(abi.encodeWithSelector(EndCreditsEscrow.NotExpired.selector, TIP));
        vm.prank(stranger);
        escrow.refund(TIP);
    }

    function test_refund_byAnyoneAfterExpiry() public {
        uint64 expiresAt = _hold();
        vm.warp(expiresAt);
        vm.expectEmit(true, true, true, true, address(escrow));
        emit EndCreditsEscrow.Refunded(TIP, payer, AMOUNT, true);

        vm.prank(stranger);
        escrow.refund(TIP);

        assertEq(usdc.balanceOf(payer), START);
        assertEq(usdc.balanceOf(stranger), 0);
        assertEq(escrow.totalPending(), 0);
    }

    function test_refund_revertsTwice() public {
        _hold();
        vm.startPrank(recorder);
        escrow.refund(TIP);
        vm.expectRevert(abi.encodeWithSelector(EndCreditsEscrow.NotPending.selector, TIP));
        escrow.refund(TIP);
        vm.stopPrank();
    }

    function test_refund_revertsAfterRelease() public {
        uint64 expiresAt = _hold();
        vm.prank(recorder);
        escrow.release(TIP, APPROVAL);
        vm.warp(expiresAt);
        vm.expectRevert(abi.encodeWithSelector(EndCreditsEscrow.NotPending.selector, TIP));
        vm.prank(stranger);
        escrow.refund(TIP);
    }
}
