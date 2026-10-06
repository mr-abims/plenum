// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Fixture} from "../utils/Fixture.sol";
import {INavOracle} from "../../src/interfaces/INavOracle.sol";
import {NavSource, Unauthorized} from "../../src/interfaces/Types.sol";
import {NavOracle} from "../../src/core/NavOracle.sol";
import {ReceiverTemplate} from "../../src/vendor/ReceiverTemplate.sol";

contract NavOracleTest is Fixture {
    function _report(uint256 nav, uint64 ts) internal view returns (bytes memory) {
        int256[] memory drift = new int256[](3);
        drift[1] = 450;
        return abi.encode(address(plenum), nav, drift, ts);
    }

    function test_onReport_fromForwarderStoresCre() public {
        uint64 ts = uint64(block.timestamp);
        vm.expectEmit(address(oracle));
        emit INavOracle.NavReported(address(plenum), 1_000 * USD, ts, NavSource.CRE);
        vm.prank(MOCK_FORWARDER);
        oracle.onReport("", _report(1_000 * USD, ts));
        INavOracle.NavReport memory r = oracle.latest(address(plenum));
        assertEq(r.nav, 1_000 * USD);
        assertEq(r.timestamp, ts);
        assertEq(uint8(r.source), uint8(NavSource.CRE));
    }

    function test_onReport_rejectsOtherSenders() public {
        vm.prank(manager); // the manager never writes NAV
        vm.expectRevert(abi.encodeWithSelector(ReceiverTemplate.InvalidSender.selector, manager, MOCK_FORWARDER));
        oracle.onReport("", _report(1, uint64(block.timestamp)));
    }

    function test_onReport_timestampsStrictlyIncrease() public {
        uint64 ts = uint64(block.timestamp);
        vm.startPrank(MOCK_FORWARDER);
        oracle.onReport("", _report(1, ts));
        vm.expectRevert(abi.encodeWithSelector(NavOracle.StaleReport.selector, address(plenum), ts, ts));
        oracle.onReport("", _report(2, ts));
        vm.stopPrank();
    }

    function test_onReport_rejectsFuture() public {
        uint64 ts = uint64(block.timestamp + 1);
        vm.prank(MOCK_FORWARDER);
        vm.expectRevert(abi.encodeWithSelector(NavOracle.FutureReport.selector, address(plenum), ts));
        oracle.onReport("", _report(1, ts));
    }

    function test_fallbackWrite_labelledFallback() public {
        vm.prank(fallbackWriter);
        oracle.fallbackWrite(address(plenum), 5 * USD);
        assertEq(uint8(oracle.latest(address(plenum)).source), uint8(NavSource.FALLBACK));
    }

    function test_fallbackWrite_onlyWriter() public {
        vm.prank(manager);
        vm.expectRevert(abi.encodeWithSelector(Unauthorized.selector, manager));
        oracle.fallbackWrite(address(plenum), 1);
    }

    function test_fallbackWriter_removable() public {
        oracle.setFallbackWriter(address(0));
        vm.prank(address(0));
        vm.expectRevert(abi.encodeWithSelector(Unauthorized.selector, address(0)));
        oracle.fallbackWrite(address(plenum), 1);
    }

    function test_forwarderSwitchableToProduction() public {
        address prod = 0xF8344CFd5c43616a4366C34E3EEE75af79a74482;
        oracle.setForwarderAddress(prod);
        vm.prank(prod);
        oracle.onReport("", _report(1, uint64(block.timestamp)));
        assertEq(oracle.latest(address(plenum)).nav, 1);
    }
}
