// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";
import {EndCreditsEscrow} from "../src/EndCreditsEscrow.sol";

/// Deploys EndCreditsEscrow. Env: USDC_ADDRESS, RECORDER_ADDRESS, CHANGE_DELAY (seconds).
contract Deploy is Script {
    function run() external returns (EndCreditsEscrow escrow) {
        address usdc = vm.envAddress("USDC_ADDRESS");
        address recorder = vm.envAddress("RECORDER_ADDRESS");
        uint64 changeDelay = uint64(vm.envUint("CHANGE_DELAY"));
        require(usdc != address(0) && recorder != address(0), "zero address");

        vm.startBroadcast();
        escrow = new EndCreditsEscrow(IERC20(usdc), recorder, changeDelay);
        vm.stopBroadcast();

        console.log("EndCreditsEscrow", address(escrow));
    }
}
