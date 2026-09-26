// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";
import {MultiBaas} from "forge-multibaas/MultiBaas.sol";
import {EndCreditsBudget} from "../src/EndCreditsBudget.sol";

/// Deploys EndCreditsBudget. Env: USDC_ADDRESS.
/// When MULTIBAAS_URL is set and the run broadcasts, the new address is also linked in MultiBaas
/// (needs MULTIBAAS_API_KEY, python3 and the `--ffi` flag). A dry run never links.
contract DeployBudget is Script {
    function run() external returns (EndCreditsBudget budget) {
        address usdc = vm.envAddress("USDC_ADDRESS");
        require(usdc != address(0), "zero address");

        vm.startBroadcast();
        budget = new EndCreditsBudget(IERC20(usdc));
        vm.stopBroadcast();

        console.log("EndCreditsBudget", address(budget));

        if (bytes(vm.envOr("MULTIBAAS_URL", string(""))).length > 0) _link(address(budget));
    }

    function _link(address budget) internal {
        if (!vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) {
            console.log("MultiBaas link skipped: not a broadcast");
            return;
        }
        MultiBaas.linkContractWithOptions(
            "EndCreditsBudget", budget, MultiBaas.withOptions("endcredits_budget", "budget", "1.0", "-100")
        );
    }
}
