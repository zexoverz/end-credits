// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC1271} from "openzeppelin-contracts/interfaces/IERC1271.sol";
import {ECDSA} from "openzeppelin-contracts/utils/cryptography/ECDSA.sol";

/// Test-only smart wallet: a signature is valid when its owner EOA signed the hash. With
/// `wrongMagic` set it answers a valid signature with a value other than the ERC-1271 magic.
contract Mock1271Wallet is IERC1271 {
    address public immutable owner;
    bool public wrongMagic;

    constructor(address owner_) {
        owner = owner_;
    }

    function setWrongMagic(bool on) external {
        wrongMagic = on;
    }

    function isValidSignature(bytes32 hash, bytes memory signature) external view returns (bytes4) {
        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(hash, signature);
        if (err != ECDSA.RecoverError.NoError || signer != owner) return 0xffffffff;
        return wrongMagic ? bytes4(0xdeadbeef) : IERC1271.isValidSignature.selector;
    }
}
