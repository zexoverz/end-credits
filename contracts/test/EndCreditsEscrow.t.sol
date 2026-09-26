// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {EndCreditsEscrow} from "../src/EndCreditsEscrow.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {Mock1271Wallet} from "./mocks/Mock1271Wallet.sol";

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

    function test_hold_revertsWithoutApprover() public {
        usdc.mint(stranger, AMOUNT);
        vm.startPrank(stranger);
        usdc.approve(address(escrow), AMOUNT);
        vm.expectRevert(abi.encodeWithSelector(EndCreditsEscrow.NoApprover.selector, stranger));
        escrow.hold(TIP, PKG, payee, AMOUNT, REASON, TTL);

        escrow.setApprover(approver);
        escrow.hold(TIP, PKG, payee, AMOUNT, REASON, TTL);
        vm.stopPrank();
        assertEq(escrow.tipOf(TIP).payer, stranger);
    }

    function test_hold_acceptsTtlBounds() public {
        vm.startPrank(payer);
        escrow.hold(keccak256("min"), PKG, payee, AMOUNT, REASON, escrow.MIN_TTL());
        escrow.hold(keccak256("max"), PKG, payee, AMOUNT, REASON, escrow.MAX_TTL());
        vm.stopPrank();
        assertEq(escrow.totalPending(), 2 * AMOUNT);
    }

    // ------------------------------------------------------------- release

    bytes32 internal constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 internal constant RELEASE_TYPEHASH =
        keccak256("Release(bytes32 tipId,address payee,uint256 amount,bytes32 approvalRef,uint256 deadline)");

    /// Built here from the spec strings, not from the contract, so a wrong typehash or domain fails.
    function _digest(bytes32 tipId, address to, uint256 amount, bytes32 ref, uint256 deadline)
        internal
        view
        returns (bytes32)
    {
        bytes32 domain = keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256("EndCreditsEscrow"), keccak256("2"), block.chainid, address(escrow))
        );
        bytes32 structHash = keccak256(abi.encode(RELEASE_TYPEHASH, tipId, to, amount, ref, deadline));
        return keccak256(abi.encodePacked("\x19\x01", domain, structHash));
    }

    function _signDigest(uint256 key, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _sig(uint256 key, bytes32 tipId, bytes32 ref, uint256 deadline) internal view returns (bytes memory) {
        return _signDigest(key, _digest(tipId, payee, AMOUNT, ref, deadline));
    }

    function _release(bytes32 tipId) internal {
        uint256 deadline = block.timestamp;
        bytes memory sig = _sig(approverKey, tipId, APPROVAL, deadline);
        vm.prank(recorder);
        escrow.release(tipId, APPROVAL, deadline, sig);
    }

    function test_releaseDigest_matchesTypedData() public {
        _hold();
        uint256 deadline = block.timestamp + 1 hours;
        assertEq(escrow.releaseDigest(TIP, APPROVAL, deadline), _digest(TIP, payee, AMOUNT, APPROVAL, deadline));
        assertEq(escrow.RELEASE_TYPEHASH(), RELEASE_TYPEHASH);

        (, string memory name, string memory version, uint256 chainId, address verifying,,) = escrow.eip712Domain();
        assertEq(name, "EndCreditsEscrow");
        assertEq(version, "2");
        assertEq(chainId, block.chainid);
        assertEq(verifying, address(escrow));
    }

    function test_release_paysFixedPayee() public {
        _hold();
        vm.expectEmit(true, true, true, true, address(escrow));
        emit EndCreditsEscrow.Released(TIP, payee, AMOUNT, APPROVAL);

        _release(TIP);

        assertEq(usdc.balanceOf(payee), AMOUNT);
        assertEq(usdc.balanceOf(recorder), 0);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(escrow.totalPending(), 0);
        assertEq(uint8(_status(TIP)), uint8(EndCreditsEscrow.TipStatus.Released));
    }

    function test_release_revertsForNonRecorder() public {
        _hold();
        uint256 deadline = block.timestamp;
        bytes memory sig = _sig(approverKey, TIP, APPROVAL, deadline);

        vm.expectRevert(abi.encodeWithSelector(EndCreditsEscrow.NotRecorder.selector));
        vm.prank(payee);
        escrow.release(TIP, APPROVAL, deadline, sig);

        vm.expectRevert(abi.encodeWithSelector(EndCreditsEscrow.NotRecorder.selector));
        vm.prank(payer);
        escrow.release(TIP, APPROVAL, deadline, sig);

        vm.expectRevert(abi.encodeWithSelector(EndCreditsEscrow.NotRecorder.selector));
        vm.prank(approver);
        escrow.release(TIP, APPROVAL, deadline, sig);
    }

    function test_release_revertsAfterExpiry() public {
        uint64 expiresAt = _hold();
        vm.warp(expiresAt);
        bytes memory sig = _sig(approverKey, TIP, APPROVAL, expiresAt);
        vm.expectRevert(abi.encodeWithSelector(EndCreditsEscrow.TipExpired.selector, TIP));
        vm.prank(recorder);
        escrow.release(TIP, APPROVAL, expiresAt, sig);
    }

    function test_release_succeedsJustBeforeExpiry() public {
        uint64 expiresAt = _hold();
        vm.warp(expiresAt - 1);
        _release(TIP);
        assertEq(usdc.balanceOf(payee), AMOUNT);
    }

    function test_release_revertsTwice() public {
        _hold();
        uint256 deadline = block.timestamp;
        bytes memory sig = _sig(approverKey, TIP, APPROVAL, deadline);
        vm.startPrank(recorder);
        escrow.release(TIP, APPROVAL, deadline, sig);
        vm.expectRevert(abi.encodeWithSelector(EndCreditsEscrow.NotPending.selector, TIP));
        escrow.release(TIP, APPROVAL, deadline, sig);
        vm.stopPrank();
    }

    function test_release_revertsAfterRefund() public {
        _hold();
        uint256 deadline = block.timestamp;
        bytes memory sig = _sig(approverKey, TIP, APPROVAL, deadline);
        vm.startPrank(recorder);
        escrow.refund(TIP);
        vm.expectRevert(abi.encodeWithSelector(EndCreditsEscrow.NotPending.selector, TIP));
        escrow.release(TIP, APPROVAL, deadline, sig);
        vm.stopPrank();
    }

    function test_release_revertsForUnknownTip() public {
        vm.expectRevert(abi.encodeWithSelector(EndCreditsEscrow.NotPending.selector, TIP));
        vm.prank(recorder);
        escrow.release(TIP, APPROVAL, block.timestamp, "");
    }

    function test_release_revertsAfterDeadline() public {
        _hold();
        uint256 deadline = block.timestamp + 10 minutes;
        bytes memory sig = _sig(approverKey, TIP, APPROVAL, deadline);

        vm.warp(deadline + 1);
        vm.expectRevert(abi.encodeWithSelector(EndCreditsEscrow.SignatureExpired.selector, deadline));
        vm.prank(recorder);
        escrow.release(TIP, APPROVAL, deadline, sig);

        vm.warp(deadline);
        vm.prank(recorder);
        escrow.release(TIP, APPROVAL, deadline, sig);
        assertEq(usdc.balanceOf(payee), AMOUNT);
    }

    function _expectBadApproval(bytes32 ref, uint256 deadline, bytes memory sig) internal {
        vm.expectRevert(abi.encodeWithSelector(EndCreditsEscrow.BadApproval.selector));
        vm.prank(recorder);
        escrow.release(TIP, ref, deadline, sig);
    }

    function test_release_revertsOnOtherSigner() public {
        _hold();
        (, uint256 otherKey) = makeAddrAndKey("other");
        uint256 deadline = block.timestamp;
        _expectBadApproval(APPROVAL, deadline, _sig(otherKey, TIP, APPROVAL, deadline));
    }

    function test_release_revertsWhenRecorderSigns() public {
        _hold();
        (, uint256 recorderKey) = makeAddrAndKey("recorder");
        uint256 deadline = block.timestamp;
        _expectBadApproval(APPROVAL, deadline, _sig(recorderKey, TIP, APPROVAL, deadline));
    }

    function test_release_revertsOnEmptyOrGarbageSignature() public {
        _hold();
        _expectBadApproval(APPROVAL, block.timestamp, "");
        _expectBadApproval(
            APPROVAL, block.timestamp, abi.encodePacked(bytes32(uint256(1)), bytes32(uint256(2)), uint8(27))
        );
    }

    function test_release_revertsOnSignatureOverOtherAmount() public {
        _hold();
        uint256 deadline = block.timestamp;
        _expectBadApproval(
            APPROVAL, deadline, _signDigest(approverKey, _digest(TIP, payee, AMOUNT + 1, APPROVAL, deadline))
        );
    }

    function test_release_revertsOnSignatureOverOtherPayee() public {
        _hold();
        uint256 deadline = block.timestamp;
        _expectBadApproval(
            APPROVAL, deadline, _signDigest(approverKey, _digest(TIP, stranger, AMOUNT, APPROVAL, deadline))
        );
    }

    function test_release_revertsOnSignatureOverOtherTip() public {
        _hold();
        uint256 deadline = block.timestamp;
        _expectBadApproval(APPROVAL, deadline, _sig(approverKey, keccak256("tip-2"), APPROVAL, deadline));
    }

    function test_release_revertsOnSignatureOverOtherApprovalRef() public {
        _hold();
        uint256 deadline = block.timestamp;
        _expectBadApproval(APPROVAL, deadline, _sig(approverKey, TIP, keccak256("other-ref"), deadline));
    }

    function test_release_revertsOnSignatureOverOtherDeadline() public {
        _hold();
        uint256 deadline = block.timestamp;
        _expectBadApproval(APPROVAL, deadline, _sig(approverKey, TIP, APPROVAL, deadline + 1));
    }

    function test_release_revertsOnOtherDomain() public {
        _hold();
        EndCreditsEscrow other = new EndCreditsEscrow(usdc, recorder, DELAY);
        uint256 deadline = block.timestamp;
        bytes32 structHash = keccak256(abi.encode(RELEASE_TYPEHASH, TIP, payee, AMOUNT, APPROVAL, deadline));
        bytes32 domain = keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256("EndCreditsEscrow"), keccak256("2"), block.chainid, address(other))
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domain, structHash));
        _expectBadApproval(APPROVAL, deadline, _signDigest(approverKey, digest));
    }

    function test_release_oldApproverSignsUntilActiveAt() public {
        (address next, uint256 nextKey) = makeAddrAndKey("next");
        bytes32 tip2 = keccak256("tip-2");
        vm.startPrank(payer);
        escrow.hold(TIP, PKG, payee, AMOUNT, REASON, escrow.MAX_TTL());
        escrow.hold(tip2, PKG, payee, AMOUNT, REASON, escrow.MAX_TTL());
        escrow.setApprover(next);
        vm.stopPrank();
        uint64 activeAt = uint64(block.timestamp) + DELAY;

        vm.warp(activeAt - 1);
        uint256 deadline = block.timestamp;
        _expectBadApproval(APPROVAL, deadline, _sig(nextKey, TIP, APPROVAL, deadline));
        _release(TIP);
        assertEq(usdc.balanceOf(payee), AMOUNT);

        vm.warp(activeAt);
        deadline = block.timestamp;
        vm.expectRevert(abi.encodeWithSelector(EndCreditsEscrow.BadApproval.selector));
        vm.prank(recorder);
        escrow.release(tip2, APPROVAL, deadline, _sig(approverKey, tip2, APPROVAL, deadline));

        vm.prank(recorder);
        escrow.release(tip2, APPROVAL, deadline, _sig(nextKey, tip2, APPROVAL, deadline));
        assertEq(usdc.balanceOf(payee), 2 * AMOUNT);
        (address current, address pending,) = escrow.approvers(payer);
        assertEq(current, next);
        assertEq(pending, address(0));
    }

    function _useWallet() internal returns (Mock1271Wallet wallet, uint256 ownerKey) {
        address owner;
        (owner, ownerKey) = makeAddrAndKey("wallet-owner");
        wallet = new Mock1271Wallet(owner);
        address walletPayer = makeAddr("wallet-payer");
        usdc.mint(walletPayer, AMOUNT);
        vm.startPrank(walletPayer);
        usdc.approve(address(escrow), AMOUNT);
        escrow.setApprover(address(wallet));
        escrow.hold(TIP, PKG, payee, AMOUNT, REASON, TTL);
        vm.stopPrank();
    }

    function test_release_acceptsErc1271Wallet() public {
        (, uint256 ownerKey) = _useWallet();
        uint256 deadline = block.timestamp;
        vm.prank(recorder);
        escrow.release(TIP, APPROVAL, deadline, _sig(ownerKey, TIP, APPROVAL, deadline));
        assertEq(usdc.balanceOf(payee), AMOUNT);
    }

    function test_release_revertsOnErc1271WrongMagic() public {
        (Mock1271Wallet wallet, uint256 ownerKey) = _useWallet();
        wallet.setWrongMagic(true);
        uint256 deadline = block.timestamp;
        _expectBadApproval(APPROVAL, deadline, _sig(ownerKey, TIP, APPROVAL, deadline));
    }

    function test_release_revertsOnErc1271OtherSigner() public {
        _useWallet();
        uint256 deadline = block.timestamp;
        _expectBadApproval(APPROVAL, deadline, _sig(approverKey, TIP, APPROVAL, deadline));
    }

    // ---------------------------------------------------------- setApprover

    function test_setApprover_revertsOnZero() public {
        vm.expectRevert(abi.encodeWithSelector(EndCreditsEscrow.ZeroApprover.selector));
        vm.prank(stranger);
        escrow.setApprover(address(0));
    }

    function test_setApprover_firstSetIsImmediate() public {
        vm.expectEmit(true, true, true, true, address(escrow));
        emit EndCreditsEscrow.ApproverSet(stranger, approver, uint64(block.timestamp));
        vm.prank(stranger);
        escrow.setApprover(approver);

        assertEq(escrow.approverOf(stranger), approver);
        (address current, address pending, uint64 activeAt) = escrow.approvers(stranger);
        assertEq(current, approver);
        assertEq(pending, address(0));
        assertEq(activeAt, 0);
    }

    function test_setApprover_changeIsPendingUntilActiveAt() public {
        address next = makeAddr("next");
        uint64 activeAt = uint64(block.timestamp) + DELAY;
        vm.expectEmit(true, true, true, true, address(escrow));
        emit EndCreditsEscrow.ApproverSet(payer, next, activeAt);
        vm.prank(payer);
        escrow.setApprover(next);

        (address current, address pending, uint64 storedAt) = escrow.approvers(payer);
        assertEq(current, approver);
        assertEq(pending, next);
        assertEq(storedAt, activeAt);

        vm.warp(activeAt - 1);
        assertEq(escrow.approverOf(payer), approver);
        vm.warp(activeAt);
        assertEq(escrow.approverOf(payer), next);
    }

    function test_setApprover_sameAddressIsNoop() public {
        vm.recordLogs();
        vm.prank(payer);
        escrow.setApprover(approver);
        assertEq(vm.getRecordedLogs().length, 0);

        (address current, address pending, uint64 activeAt) = escrow.approvers(payer);
        assertEq(current, approver);
        assertEq(pending, address(0));
        assertEq(activeAt, 0);
    }

    function test_setApprover_changeAfterDueChangeStartsFromPromoted() public {
        address next = makeAddr("next");
        address third = makeAddr("third");
        vm.prank(payer);
        escrow.setApprover(next);
        vm.warp(block.timestamp + DELAY);

        vm.prank(payer);
        escrow.setApprover(third);
        (address current, address pending,) = escrow.approvers(payer);
        assertEq(current, next);
        assertEq(pending, third);
        assertEq(escrow.approverOf(payer), next);
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

    function test_refund_byPayerBeforeExpiry() public {
        _hold();
        vm.expectEmit(true, true, true, true, address(escrow));
        emit EndCreditsEscrow.Refunded(TIP, payer, AMOUNT, false);

        vm.prank(payer);
        escrow.refund(TIP);

        assertEq(usdc.balanceOf(payer), START);
        assertEq(escrow.totalPending(), 0);
        assertEq(uint8(_status(TIP)), uint8(EndCreditsEscrow.TipStatus.Refunded));
    }

    function test_refund_revertsForApproverBeforeExpiry() public {
        _hold();
        vm.expectRevert(abi.encodeWithSelector(EndCreditsEscrow.NotExpired.selector, TIP));
        vm.prank(approver);
        escrow.refund(TIP);
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
        _release(TIP);
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
