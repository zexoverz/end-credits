// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {CommonBase} from "forge-std/Base.sol";
import {StdCheats} from "forge-std/StdCheats.sol";
import {StdUtils} from "forge-std/StdUtils.sol";
import {EndCreditsEscrow} from "../src/EndCreditsEscrow.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

/// Drives the escrow with random, mostly valid calls and tracks what the totals should be.
contract EscrowHandler is CommonBase, StdCheats, StdUtils {
    EndCreditsEscrow internal escrow;
    MockUSDC internal usdc;
    address internal recorder;

    address[3] internal payers = [address(0xA1), address(0xA2), address(0xA3)];
    address[3] internal payees = [address(0xB1), address(0xB2), address(0xB3)];
    bytes32[3] internal pkgs = [keccak256("npm:a"), keccak256("npm:b"), keccak256("npm:c")];

    bytes32[] public tipIds;
    uint256 internal nonce;

    uint256 public ghostPending;
    uint256 public ghostReserved;
    mapping(bytes32 => uint256) public calls;

    constructor(EndCreditsEscrow escrow_, MockUSDC usdc_, address recorder_) {
        escrow = escrow_;
        usdc = usdc_;
        recorder = recorder_;
        for (uint256 i; i < 3; i++) {
            (address approver,) = makeAddrAndKey(string(abi.encode("approver", i)));
            vm.prank(payers[i]);
            escrow.setApprover(approver);
        }
    }

    function _fund(address who, uint256 amount) internal {
        usdc.mint(who, amount);
        vm.prank(who);
        usdc.approve(address(escrow), amount);
    }

    function hold(uint256 actorSeed, uint256 payeeSeed, uint256 pkgSeed, uint256 amount, uint256 ttl) external {
        address payer = payers[actorSeed % 3];
        amount = bound(amount, 1, 1e12);
        uint64 ttl64 = uint64(bound(ttl, escrow.MIN_TTL(), escrow.MAX_TTL()));
        bytes32 tipId = keccak256(abi.encode("tip", nonce++));
        _fund(payer, amount);

        vm.prank(payer);
        escrow.hold(tipId, pkgs[pkgSeed % 3], payees[payeeSeed % 3], amount, 1, ttl64);
        tipIds.push(tipId);
        ghostPending += amount;
        calls["hold"]++;
    }

    function release(uint256 tipSeed) external {
        if (tipIds.length == 0) return;
        bytes32 tipId = tipIds[tipSeed % tipIds.length];
        EndCreditsEscrow.Tip memory t = escrow.tipOf(tipId);
        if (t.status != EndCreditsEscrow.TipStatus.Pending || block.timestamp >= t.expiresAt) return;

        vm.prank(recorder);
        escrow.release(tipId, bytes32(tipSeed));
        ghostPending -= t.amount;
        calls["release"]++;
    }

    function refund(uint256 tipSeed, bool asRecorder) external {
        if (tipIds.length == 0) return;
        bytes32 tipId = tipIds[tipSeed % tipIds.length];
        EndCreditsEscrow.Tip memory t = escrow.tipOf(tipId);
        if (t.status != EndCreditsEscrow.TipStatus.Pending) return;
        if (!asRecorder && block.timestamp < t.expiresAt) return;

        vm.prank(asRecorder ? recorder : address(0xC0FFEE));
        escrow.refund(tipId);
        ghostPending -= t.amount;
        calls["refund"]++;
    }

    function reserve(uint256 actorSeed, uint256 pkgSeed, uint256 amount) external {
        address payer = payers[actorSeed % 3];
        amount = bound(amount, 1, 1e12);
        _fund(payer, amount);

        vm.prank(payer);
        escrow.reserve(pkgs[pkgSeed % 3], amount, bytes32(actorSeed));
        ghostReserved += amount;
        calls["reserve"]++;
    }

    function setClaim(uint256 pkgSeed, uint256 payeeSeed) external {
        vm.prank(recorder);
        escrow.setClaim(pkgs[pkgSeed % 3], payees[payeeSeed % 3], bytes32(payeeSeed));
        calls["setClaim"]++;
    }

    function claim(uint256 pkgSeed) external {
        bytes32 pkg = pkgs[pkgSeed % 3];
        (address payee, uint64 changedAt, bool changed) = escrow.claims(pkg);
        uint256 amount = escrow.reserved(pkg);
        if (payee == address(0) || amount == 0) return;
        if (changed && block.timestamp < changedAt + escrow.changeDelay()) return;

        escrow.claim(pkg);
        ghostReserved -= amount;
        calls["claim"]++;
    }

    function warp(uint256 secs) external {
        skip(bound(secs, 0, 2 days));
    }
}

contract EndCreditsEscrowInvariantTest is StdInvariant, Test {
    EndCreditsEscrow internal escrow;
    MockUSDC internal usdc;
    EscrowHandler internal handler;
    address internal recorder = makeAddr("recorder");

    function setUp() public {
        vm.warp(1_790_000_000);
        usdc = new MockUSDC();
        escrow = new EndCreditsEscrow(usdc, recorder, 3 days);
        handler = new EscrowHandler(escrow, usdc, recorder);

        bytes4[] memory selectors = new bytes4[](7);
        selectors[0] = EscrowHandler.hold.selector;
        selectors[1] = EscrowHandler.release.selector;
        selectors[2] = EscrowHandler.refund.selector;
        selectors[3] = EscrowHandler.reserve.selector;
        selectors[4] = EscrowHandler.setClaim.selector;
        selectors[5] = EscrowHandler.claim.selector;
        selectors[6] = EscrowHandler.warp.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
        targetContract(address(handler));
    }

    function invariant_balanceEqualsPendingPlusReserved() public view {
        assertEq(usdc.balanceOf(address(escrow)), escrow.totalPending() + escrow.totalReserved());
    }

    function invariant_totalsMatchGhosts() public view {
        assertEq(escrow.totalPending(), handler.ghostPending());
        assertEq(escrow.totalReserved(), handler.ghostReserved());
    }
}
