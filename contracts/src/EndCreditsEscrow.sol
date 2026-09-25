// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/token/ERC20/utils/SafeERC20.sol";
import {SafeCast} from "openzeppelin-contracts/utils/math/SafeCast.sol";

/// @title EndCreditsEscrow
/// @notice Holds doubtful tips until the owner approves or they expire, and reserves money for
/// packages with no claimed payee yet. A held tip can only go to the payee fixed at hold time, or
/// back to its payer. A reserve can only go to the package's claimed payee.
contract EndCreditsEscrow {
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

    IERC20 public immutable usdc;
    address public immutable recorder;
    uint64 public immutable changeDelay;
    uint64 public constant MIN_TTL = 60;
    uint64 public constant MAX_TTL = 7 days;

    mapping(bytes32 => Tip) public tips;
    mapping(bytes32 => uint256) public reserved;
    mapping(bytes32 => Claim) public claims;
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

    modifier onlyRecorder() {
        if (msg.sender != recorder) revert NotRecorder();
        _;
    }

    constructor(IERC20 usdc_, address recorder_, uint64 changeDelay_) {
        usdc = usdc_;
        recorder = recorder_;
        changeDelay = changeDelay_;
    }

    /// @notice Pull `amount` from the caller and hold it for `payee` until released or refunded.
    function hold(bytes32 tipId, bytes32 packageKey, address payee, uint256 amount, uint8 reason, uint64 ttl)
        external
    {
        if (tips[tipId].status != TipStatus.None) revert TipExists(tipId);
        if (amount == 0) revert ZeroAmount();
        if (payee == address(0)) revert ZeroPayee();
        if (ttl < MIN_TTL || ttl > MAX_TTL) revert TtlOutOfRange(ttl);

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

    /// @notice Send a pending, unexpired tip to the payee fixed at hold time.
    function release(bytes32 tipId, bytes32 approvalRef) external onlyRecorder {
        Tip storage tip = tips[tipId];
        if (tip.status != TipStatus.Pending) revert NotPending(tipId);
        if (block.timestamp >= tip.expiresAt) revert TipExpired(tipId);

        uint256 amount = tip.amount;
        address payee = tip.payee;
        tip.status = TipStatus.Released;
        totalPending -= amount;

        emit Released(tipId, payee, amount, approvalRef);
        usdc.safeTransfer(payee, amount);
    }

    function tipOf(bytes32 tipId) external view returns (Tip memory) {
        return tips[tipId];
    }
}
