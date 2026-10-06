// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {IMandate} from "../interfaces/IMandate.sol";
import {IAssetAdapter} from "../interfaces/IAssetAdapter.sol";
import {INavOracle} from "../interfaces/INavOracle.sol";
import {IPlenum} from "../interfaces/IPlenum.sol";
import {Action, MandateConfig, NotImplemented, Op, Reason} from "../interfaces/Types.sol";

/// @title Mandate
/// @notice One plenum's investment policy and its pure pre-trade check. `check` never reverts on policy.
/// @dev Weights are measured against holdings read onchain (cash + Σ adapter value + pending); the oracle NAV
///      gates freshness (SPEC A15). RequestRedeem moves value to "pending", which still counts toward its sleeve
///      but not toward the cash floor. No-worse rule (SPEC A18): each sleeve passes if it ends inside its band or
///      no further from target than it started, on the same side; cash passes if it ends at/above the floor or
///      no lower than it started.
contract Mandate is IMandate, Initializable {
    uint256 internal constant BPS = 10_000;

    address public plenum;
    address public navOracle;
    address public governance;
    MandateConfig internal _config;

    error InvalidConfig();

    constructor() {
        _disableInitializers();
    }

    /// @inheritdoc IMandate
    function initialize(address plenum_, address navOracle_, address governance_, MandateConfig calldata config_)
        external
        initializer
    {
        _validate(config_);
        plenum = plenum_;
        navOracle = navOracle_;
        governance = governance_;
        _config = config_;
    }

    /// @inheritdoc IMandate
    function config() external view returns (MandateConfig memory) {
        return _config;
    }

    /// @notice Seconds before a NAV report counts as stale.
    function navMaxAge() external view returns (uint32) {
        return _config.navMaxAge;
    }

    /// @notice Maximum number of members.
    function maxMembers() external view returns (uint16) {
        return _config.maxMembers;
    }

    /// @inheritdoc IMandate
    function holdingsTotal() external view returns (uint256 total) {
        total = IPlenum(plenum).cash();
        address[] storage list = _config.adapters;
        for (uint256 i; i < list.length; ++i) {
            total += IAssetAdapter(list[i]).valueOf(plenum) + IAssetAdapter(list[i]).pendingOf(plenum);
        }
    }

    /// @inheritdoc IMandate
    function isAllowed(address adapter) public view returns (bool) {
        (bool found,) = _indexOf(adapter);
        return found;
    }

    /// @inheritdoc IMandate
    function check(Action[] calldata actions) external view returns (Reason) {
        MandateConfig storage c = _config;
        uint256 n = c.adapters.length;

        // 1. Allowlist and op/adapter compatibility.
        for (uint256 k; k < actions.length; ++k) {
            (bool found,) = _indexOf(actions[k].adapter);
            if (!found) return Reason.ADAPTER_NOT_ALLOWED;
            bool isAsync = IAssetAdapter(actions[k].adapter).isAsync();
            Op op = actions[k].op;
            if ((op == Op.Withdraw && isAsync) || ((op == Op.RequestRedeem || op == Op.Claim) && !isAsync)) {
                return Reason.ADAPTER_NOT_ALLOWED;
            }
        }

        // 2. NAV freshness.
        INavOracle.NavReport memory r = INavOracle(navOracle).latest(plenum);
        if (r.timestamp == 0 || block.timestamp > uint256(r.timestamp) + c.navMaxAge) return Reason.NAV_STALE;

        // 3. Simulate post-trade holdings (internal moves leave the total unchanged).
        uint256 cashPre = IPlenum(plenum).cash();
        uint256[] memory pre = new uint256[](n);
        uint256[] memory value = new uint256[](n);
        uint256[] memory pend = new uint256[](n);
        uint256 total = cashPre;
        for (uint256 i; i < n; ++i) {
            IAssetAdapter a = IAssetAdapter(c.adapters[i]);
            value[i] = a.valueOf(plenum);
            pend[i] = a.pendingOf(plenum);
            pre[i] = value[i] + pend[i];
            total += pre[i];
        }
        if (total == 0) return actions.length == 0 ? Reason.OK : Reason.LIQUIDITY_FLOOR;

        uint256 cash = cashPre;
        for (uint256 k; k < actions.length; ++k) {
            Action calldata act = actions[k];
            (, uint256 i) = _indexOf(act.adapter);
            if (act.op == Op.Claim) {
                uint256 amt = IAssetAdapter(act.adapter).claimable(act.assets);
                if (amt > pend[i]) amt = pend[i];
                pend[i] -= amt;
                cash += amt;
                continue;
            }
            uint256 assets = act.assets;
            if (assets * BPS > uint256(c.maxTradeBps) * total) return Reason.TRADE_TOO_LARGE;
            if (act.op == Op.Deposit) {
                if (assets > cash) return Reason.LIQUIDITY_FLOOR;
                cash -= assets;
                value[i] += assets;
            } else {
                if (assets > value[i]) return Reason.TRADE_TOO_LARGE;
                value[i] -= assets;
                if (act.op == Op.Withdraw) cash += assets;
                else pend[i] += assets; // RequestRedeem
            }
        }

        // 4. Cash floor, then bands — each under the no-worse rule.
        if (cash * BPS < uint256(c.minLiquidityBps) * total && cash < cashPre) return Reason.LIQUIDITY_FLOOR;
        for (uint256 i; i < n; ++i) {
            if (!_sleeveOk(pre[i], value[i] + pend[i], c.targetBps[i], c.bandBps[i], total)) {
                return Reason.WEIGHT_OUT_OF_BAND;
            }
        }
        return Reason.OK;
    }

    /// @dev Exact integer form of: in band after, or no further from target than before and on the same side.
    ///      Values are scaled by BPS so weights never round.
    function _sleeveOk(uint256 before, uint256 after_, uint256 targetBps, uint256 bandBps, uint256 total)
        internal
        pure
        returns (bool)
    {
        uint256 t = targetBps * total;
        uint256 x = after_ * BPS;
        uint256 b = bandBps * total;
        if (x + b >= t && x <= t + b) return true; // inside the band
        uint256 y = before * BPS;
        if (x > t) return y >= x; // above band: may only come down, not cross
        return y <= x; // below band: may only go up, not cross
    }

    /// @inheritdoc IMandate
    function scheduleChange(MandateConfig calldata) external pure {
        revert NotImplemented(); // stretch: MD-3
    }

    /// @inheritdoc IMandate
    function applyChange() external pure {
        revert NotImplemented(); // stretch: MD-3
    }

    function _indexOf(address adapter) internal view returns (bool, uint256) {
        address[] storage list = _config.adapters;
        for (uint256 i; i < list.length; ++i) {
            if (list[i] == adapter) return (true, i);
        }
        return (false, 0);
    }

    function _validate(MandateConfig calldata c) internal pure {
        uint256 n = c.adapters.length;
        if (c.targetBps.length != n || c.bandBps.length != n) revert InvalidConfig();
        uint256 sum = c.minLiquidityBps;
        for (uint256 i; i < n; ++i) {
            if (c.adapters[i] == address(0)) revert InvalidConfig();
            for (uint256 j; j < i; ++j) {
                if (c.adapters[j] == c.adapters[i]) revert InvalidConfig();
            }
            sum += c.targetBps[i];
        }
        if (sum > BPS || c.maxTradeBps == 0 || c.maxTradeBps > BPS || c.navMaxAge == 0) revert InvalidConfig();
        if (c.maxMembers == 0 || c.maxMembers > 99 || c.pauseQuorum == 0 || c.votingPeriod == 0) {
            revert InvalidConfig();
        }
    }
}
