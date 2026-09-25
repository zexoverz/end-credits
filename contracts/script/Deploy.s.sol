// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";
import {MultiBaas} from "forge-multibaas/MultiBaas.sol";
import {EndCreditsEscrow} from "../src/EndCreditsEscrow.sol";

/// Deploys EndCreditsEscrow. Env: USDC_ADDRESS, RECORDER_ADDRESS, CHANGE_DELAY (seconds).
/// When MULTIBAAS_URL is set and the run broadcasts, the new address is also linked in MultiBaas
/// (needs MULTIBAAS_API_KEY, python3 and the `--ffi` flag). A dry run never links.
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

        if (bytes(vm.envOr("MULTIBAAS_URL", string(""))).length > 0) _link(address(escrow));
    }

    function _link(address escrow) internal {
        if (!vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) {
            console.log("MultiBaas link skipped: not a broadcast");
            return;
        }
        MultiBaas.linkContractWithOptions(
            "EndCreditsEscrow", escrow, MultiBaas.withOptions("endcredits_escrow", "escrow", "1.0", "-100")
        );
    }
}
