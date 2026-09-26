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
    address internal approver;
    uint256 internal approverKey;

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
        (approver, approverKey) = makeAddrAndKey("approver");
        vm.startPrank(payer);
        usdc.approve(address(escrow), type(uint256).max);
        escrow.setApprover(approver);
        vm.stopPrank();
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

    // ------------------------------------------------------------- reserve

    function _reserve(uint256 amount) internal {
        vm.prank(payer);
        escrow.reserve(PKG, amount, SESSION);
    }

    function test_reserve_accumulatesAndEmits() public {
        bytes32 session2 = keccak256("session-2");
        vm.expectEmit(true, true, true, true, address(escrow));
        emit EndCreditsEscrow.Reserved(PKG, payer, AMOUNT, SESSION);
        _reserve(AMOUNT);

        vm.expectEmit(true, true, true, true, address(escrow));
        emit EndCreditsEscrow.Reserved(PKG, payer, 2 * AMOUNT, session2);
        vm.prank(payer);
        escrow.reserve(PKG, 2 * AMOUNT, session2);

        assertEq(escrow.reserved(PKG), 3 * AMOUNT);
        assertEq(escrow.totalReserved(), 3 * AMOUNT);
        assertEq(usdc.balanceOf(address(escrow)), 3 * AMOUNT);
        assertEq(usdc.balanceOf(payer), START - 3 * AMOUNT);
    }

    function test_reserve_revertsOnZeroAmount() public {
        vm.expectRevert(abi.encodeWithSelector(EndCreditsEscrow.ZeroAmount.selector));
        _reserve(0);
    }

    // ------------------------------------------------------------ setClaim

    function _setClaim(address who) internal {
        vm.prank(recorder);
        escrow.setClaim(PKG, who, EVIDENCE);
    }

    function test_setClaim_emitsWithPrevious() public {
        vm.expectEmit(true, true, true, true, address(escrow));
        emit EndCreditsEscrow.ClaimSet(PKG, maintainerA, address(0), EVIDENCE);
        _setClaim(maintainerA);

        vm.expectEmit(true, true, true, true, address(escrow));
        emit EndCreditsEscrow.ClaimSet(PKG, maintainerB, maintainerA, EVIDENCE);
        _setClaim(maintainerB);

        assertEq(escrow.claimOf(PKG), maintainerB);
    }

    function test_setClaim_revertsForNonRecorder() public {
        vm.expectRevert(abi.encodeWithSelector(EndCreditsEscrow.NotRecorder.selector));
        vm.prank(stranger);
        escrow.setClaim(PKG, stranger, EVIDENCE);
    }

    function test_setClaim_revertsOnZeroPayee() public {
        vm.expectRevert(abi.encodeWithSelector(EndCreditsEscrow.ZeroPayee.selector));
        vm.prank(recorder);
        escrow.setClaim(PKG, address(0), EVIDENCE);
    }

    function test_setClaim_samePayeeIsNotAChange() public {
        _setClaim(maintainerA);
        _setClaim(maintainerA);
        (, uint64 changedAt, bool changed) = escrow.claims(PKG);
        assertFalse(changed);
        assertEq(changedAt, 0);

        _reserve(AMOUNT);
        escrow.claim(PKG);
        assertEq(usdc.balanceOf(maintainerA), AMOUNT);
    }

    // --------------------------------------------------------------- claim

    function test_claim_paysClaimedPayeeAndZeroes() public {
        _reserve(AMOUNT);
        _setClaim(maintainerA);

        vm.expectEmit(true, true, true, true, address(escrow));
        emit EndCreditsEscrow.Claimed(PKG, maintainerA, AMOUNT);
        vm.prank(stranger);
        escrow.claim(PKG);

        assertEq(usdc.balanceOf(maintainerA), AMOUNT);
        assertEq(usdc.balanceOf(stranger), 0);
        assertEq(escrow.reserved(PKG), 0);
        assertEq(escrow.totalReserved(), 0);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_claim_revertsWithoutClaim() public {
        _reserve(AMOUNT);
        vm.expectRevert(abi.encodeWithSelector(EndCreditsEscrow.NoClaim.selector, PKG));
        escrow.claim(PKG);
    }

    function test_claim_revertsWhenNothingReserved() public {
        _setClaim(maintainerA);
        vm.expectRevert(abi.encodeWithSelector(EndCreditsEscrow.NothingReserved.selector, PKG));
        escrow.claim(PKG);
    }

    function test_claim_revertsAfterReserveDrained() public {
        _reserve(AMOUNT);
        _setClaim(maintainerA);
        escrow.claim(PKG);
        vm.expectRevert(abi.encodeWithSelector(EndCreditsEscrow.NothingReserved.selector, PKG));
        escrow.claim(PKG);
    }

    function test_claim_firstSetClaimHasNoDelay() public {
        _reserve(AMOUNT);
        _setClaim(maintainerA);
        (, uint64 changedAt, bool changed) = escrow.claims(PKG);
        assertFalse(changed);
        assertEq(changedAt, 0);

        escrow.claim(PKG);
        assertEq(usdc.balanceOf(maintainerA), AMOUNT);
    }

    function test_claim_revertsDuringCoolingAfterChange() public {
        _reserve(AMOUNT);
        _setClaim(maintainerA);
        vm.warp(block.timestamp + 1 hours);
        _setClaim(maintainerB);
        uint64 until = uint64(block.timestamp) + DELAY;

        (, uint64 changedAt, bool changed) = escrow.claims(PKG);
        assertTrue(changed);
        assertEq(changedAt, uint64(block.timestamp));

        vm.warp(until - 1);
        vm.expectRevert(abi.encodeWithSelector(EndCreditsEscrow.ClaimCoolingDown.selector, PKG, until));
        escrow.claim(PKG);
    }

    function test_claim_succeedsAfterCooling() public {
        _reserve(AMOUNT);
        _setClaim(maintainerA);
        _setClaim(maintainerB);
        vm.warp(block.timestamp + DELAY);

        escrow.claim(PKG);
        assertEq(usdc.balanceOf(maintainerB), AMOUNT);
        assertEq(usdc.balanceOf(maintainerA), 0);
        assertEq(escrow.reserved(PKG), 0);
    }

    // ------------------------------------------------------- recordSession

    function test_recordSession_emits() public {
        bytes32 ownerHash = keccak256("owner");
        bytes32 manifest = keccak256("manifest");
        vm.expectEmit(true, true, true, true, address(escrow));
        emit EndCreditsEscrow.SessionSettled(SESSION, ownerHash, 5e6, 3e6, 1e6, 5e5, 5e5, manifest);
        vm.prank(recorder);
        escrow.recordSession(SESSION, ownerHash, 5e6, 3e6, 1e6, 5e5, 5e5, manifest);
    }

    function test_recordSession_revertsForNonRecorder() public {
        vm.expectRevert(abi.encodeWithSelector(EndCreditsEscrow.NotRecorder.selector));
        vm.prank(stranger);
        escrow.recordSession(SESSION, bytes32(0), 1, 1, 0, 0, 0, bytes32(0));
    }

    // ---------------------------------------------------------------- fuzz

    function testFuzz_holdRefund_returnsExactAmount(uint256 amount, uint64 ttl, bool byRecorder) public {
        amount = bound(amount, 1, type(uint128).max);
        ttl = uint64(bound(ttl, escrow.MIN_TTL(), escrow.MAX_TTL()));
        address funder = makeAddr("funder");
        usdc.mint(funder, amount);
        vm.startPrank(funder);
        usdc.approve(address(escrow), amount);
        escrow.setApprover(approver);
        escrow.hold(TIP, PKG, payee, amount, REASON, ttl);
        vm.stopPrank();
        assertEq(usdc.balanceOf(funder), 0);
        assertEq(escrow.totalPending(), amount);

        if (byRecorder) {
            vm.prank(recorder);
        } else {
            vm.warp(block.timestamp + ttl);
            vm.prank(stranger);
        }
        escrow.refund(TIP);

        assertEq(usdc.balanceOf(funder), amount);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(escrow.totalPending(), 0);
    }

    function test_hold_revertsAboveUint128() public {
        uint256 amount = uint256(type(uint128).max) + 1;
        usdc.mint(payer, amount);
        vm.expectRevert(abi.encodeWithSignature("SafeCastOverflowedUintDowncast(uint8,uint256)", 128, amount));
        vm.prank(payer);
        escrow.hold(TIP, PKG, payee, amount, REASON, TTL);
    }
}
