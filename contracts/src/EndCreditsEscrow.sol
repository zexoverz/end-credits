// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/token/ERC20/utils/SafeERC20.sol";
import {SafeCast} from "openzeppelin-contracts/utils/math/SafeCast.sol";
import {EIP712} from "openzeppelin-contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "openzeppelin-contracts/utils/cryptography/SignatureChecker.sol";

/// @title EndCreditsEscrow
/// @notice Holds doubtful tips until the owner approves or they expire, and reserves money for
/// packages with no claimed payee yet. A held tip can only go to the payee fixed at hold time, or
/// back to its payer, and a release needs an EIP-712 signature from the payer's approver. A reserve
/// can only go to the package's claimed payee.
contract EndCreditsEscrow is EIP712 {
    using SafeERC20 for IERC20;

    enum TipStatus {
        None,
        Pending,
        Released,
        Refunded
    }

    struct Tip {
        address payer;
        address payee;
        bytes32 packageKey;
        uint128 amount;
        uint64 expiresAt;
        TipStatus status;
    }

    struct Claim {
        address payee;
        uint64 changedAt;
        bool changed;
    }

    /// @dev `pending` replaces `current` once `block.timestamp >= activeAt`.
    struct Approver {
        address current;
        address pending;
        uint64 activeAt;
    }

    IERC20 public immutable usdc;
    address public immutable recorder;
    uint64 public immutable changeDelay;
    uint64 public constant MIN_TTL = 60;
    uint64 public constant MAX_TTL = 7 days;
    bytes32 public constant RELEASE_TYPEHASH =
        keccak256("Release(bytes32 tipId,address payee,uint256 amount,bytes32 approvalRef,uint256 deadline)");

    mapping(bytes32 => Tip) public tips;
    mapping(bytes32 => uint256) public reserved;
    mapping(bytes32 => Claim) public claims;
    mapping(address payer => Approver) public approvers;
    uint256 public totalPending;
    uint256 public totalReserved;

    event Held(
        bytes32 indexed tipId,
        bytes32 indexed packageKey,
        address indexed payer,
        address payee,
        uint256 amount,
        uint8 reason,
        uint64 expiresAt
    );
    event Released(bytes32 indexed tipId, address indexed payee, uint256 amount, bytes32 approvalRef);
    event Refunded(bytes32 indexed tipId, address indexed payer, uint256 amount, bool expired);
    event Reserved(bytes32 indexed packageKey, address indexed payer, uint256 amount, bytes32 indexed sessionId);
    event ClaimSet(bytes32 indexed packageKey, address indexed payee, address previous, bytes32 evidence);
    event Claimed(bytes32 indexed packageKey, address indexed payee, uint256 amount);
    event ApproverSet(address indexed payer, address indexed approver, uint64 activeAt);
    event SessionSettled(
        bytes32 indexed sessionId,
        bytes32 indexed ownerHash,
        uint256 budget,
        uint256 paid,
        uint256 held,
        uint256 reservedAmount,
        uint256 refused,
        bytes32 manifestHash
    );

    error NotRecorder();
    error ZeroAmount();
    error ZeroPayee();
    error TipExists(bytes32 tipId);
    error NotPending(bytes32 tipId);
    error TipExpired(bytes32 tipId);
    error NotExpired(bytes32 tipId);
    error TtlOutOfRange(uint64 ttl);
    error NoClaim(bytes32 packageKey);
    error NothingReserved(bytes32 packageKey);
    error ClaimCoolingDown(bytes32 packageKey, uint64 until);
    error ZeroApprover();
    error NoApprover(address payer);
    error SignatureExpired(uint256 deadline);
    error BadApproval();

    modifier onlyRecorder() {
        if (msg.sender != recorder) revert NotRecorder();
        _;
    }

    constructor(IERC20 usdc_, address recorder_, uint64 changeDelay_) EIP712("EndCreditsEscrow", "2") {
        usdc = usdc_;
        recorder = recorder_;
        changeDelay = changeDelay_;
    }

    /// @notice Set the caller's approver, the key that must sign each release of the caller's
    /// held tips. The first set is immediate; a later change takes effect after `changeDelay`.
    function setApprover(address approver) external {
        if (approver == address(0)) revert ZeroApprover();

        _promote(msg.sender);
        Approver storage a = approvers[msg.sender];
        if (a.current == approver) return;

        uint64 activeAt = uint64(block.timestamp);
        if (a.current == address(0)) {
            a.current = approver;
        } else {
            activeAt += changeDelay;
            a.pending = approver;
            a.activeAt = activeAt;
        }
        emit ApproverSet(msg.sender, approver, activeAt);
    }

    /// @notice Pull `amount` from the caller and hold it for `payee` until released or refunded.
    function hold(bytes32 tipId, bytes32 packageKey, address payee, uint256 amount, uint8 reason, uint64 ttl)
        external
    {
        if (tips[tipId].status != TipStatus.None) revert TipExists(tipId);
        if (amount == 0) revert ZeroAmount();
        if (payee == address(0)) revert ZeroPayee();
        if (ttl < MIN_TTL || ttl > MAX_TTL) revert TtlOutOfRange(ttl);
        _promote(msg.sender);
        if (approvers[msg.sender].current == address(0)) revert NoApprover(msg.sender);

        uint64 expiresAt = uint64(block.timestamp) + ttl;
        tips[tipId] = Tip({
            payer: msg.sender,
            payee: payee,
            packageKey: packageKey,
            amount: SafeCast.toUint128(amount),
            expiresAt: expiresAt,
            status: TipStatus.Pending
        });
        totalPending += amount;

        emit Held(tipId, packageKey, msg.sender, payee, amount, reason, expiresAt);
        usdc.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Send a pending, unexpired tip to the payee fixed at hold time. `signature` is the
    /// payer's current approver signing `releaseDigest(tipId, approvalRef, deadline)`.
    function release(bytes32 tipId, bytes32 approvalRef, uint256 deadline, bytes calldata signature)
        external
        onlyRecorder
    {
        Tip storage tip = tips[tipId];
        if (tip.status != TipStatus.Pending) revert NotPending(tipId);
        if (block.timestamp >= tip.expiresAt) revert TipExpired(tipId);
        if (block.timestamp > deadline) revert SignatureExpired(deadline);

        _promote(tip.payer);
        bytes32 digest = releaseDigest(tipId, approvalRef, deadline);
        if (!SignatureChecker.isValidSignatureNow(approvers[tip.payer].current, digest, signature)) {
            revert BadApproval();
        }

        uint256 amount = tip.amount;
        address payee = tip.payee;
        tip.status = TipStatus.Released;
        totalPending -= amount;

        emit Released(tipId, payee, amount, approvalRef);
        usdc.safeTransfer(payee, amount);
    }

    /// @notice Return a pending tip to its payer. The recorder may do so any time (a deny);
    /// anyone may once the tip has expired.
    function refund(bytes32 tipId) external {
        Tip storage tip = tips[tipId];
        if (tip.status != TipStatus.Pending) revert NotPending(tipId);
        bool expired = block.timestamp >= tip.expiresAt;
        if (msg.sender != recorder && !expired) revert NotExpired(tipId);

        uint256 amount = tip.amount;
        address payer = tip.payer;
        tip.status = TipStatus.Refunded;
        totalPending -= amount;

        emit Refunded(tipId, payer, amount, expired);
        usdc.safeTransfer(payer, amount);
    }

    /// @notice Pull `amount` from the caller into the package's reserve.
    function reserve(bytes32 packageKey, uint256 amount, bytes32 sessionId) external {
        if (amount == 0) revert ZeroAmount();

        reserved[packageKey] += amount;
        totalReserved += amount;

        emit Reserved(packageKey, msg.sender, amount, sessionId);
        usdc.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Set or change the package's payee. The first set is not a change; a later set to a
    /// different payee starts `changeDelay`, during which `claim` is blocked.
    function setClaim(bytes32 packageKey, address payee, bytes32 evidence) external onlyRecorder {
        if (payee == address(0)) revert ZeroPayee();

        Claim storage c = claims[packageKey];
        address previous = c.payee;
        if (previous != address(0) && previous != payee) {
            c.changed = true;
            c.changedAt = uint64(block.timestamp);
        }
        c.payee = payee;

        emit ClaimSet(packageKey, payee, previous, evidence);
    }

    /// @notice Send the package's whole reserve to its claimed payee. Anyone may call.
    function claim(bytes32 packageKey) external {
        Claim memory c = claims[packageKey];
        if (c.payee == address(0)) revert NoClaim(packageKey);
        if (c.changed) {
            uint64 until = c.changedAt + changeDelay;
            if (block.timestamp < until) revert ClaimCoolingDown(packageKey, until);
        }
        uint256 amount = reserved[packageKey];
        if (amount == 0) revert NothingReserved(packageKey);

        reserved[packageKey] = 0;
        totalReserved -= amount;

        emit Claimed(packageKey, c.payee, amount);
        usdc.safeTransfer(c.payee, amount);
    }

    /// @notice One event per settled session, for the dashboard. Moves no funds.
    function recordSession(
        bytes32 sessionId,
        bytes32 ownerHash,
        uint256 budget,
        uint256 paid,
        uint256 held,
        uint256 reservedAmount,
        uint256 refused,
        bytes32 manifestHash
    ) external onlyRecorder {
        emit SessionSettled(sessionId, ownerHash, budget, paid, held, reservedAmount, refused, manifestHash);
    }

    /// @notice The approver in force for `payer` now, with any due pending change applied.
    function approverOf(address payer) public view returns (address) {
        Approver memory a = approvers[payer];
        if (a.pending != address(0) && block.timestamp >= a.activeAt) return a.pending;
        return a.current;
    }

    /// @notice The EIP-712 digest the approver signs to release `tipId`. Binds the stored payee
    /// and amount, so a signature cannot be reused for a different tip, payee or amount.
    function releaseDigest(bytes32 tipId, bytes32 approvalRef, uint256 deadline) public view returns (bytes32) {
        Tip storage tip = tips[tipId];
        return _hashTypedDataV4(
            keccak256(abi.encode(RELEASE_TYPEHASH, tipId, tip.payee, uint256(tip.amount), approvalRef, deadline))
        );
    }

    function _promote(address payer) internal {
        Approver storage a = approvers[payer];
        if (a.pending != address(0) && block.timestamp >= a.activeAt) {
            a.current = a.pending;
            a.pending = address(0);
            a.activeAt = 0;
        }
    }

    function claimOf(bytes32 packageKey) external view returns (address) {
        return claims[packageKey].payee;
    }

    function tipOf(bytes32 tipId) external view returns (Tip memory) {
        return tips[tipId];
    }
}
