// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {Fixture} from "../utils/Fixture.sol";
import {PlenumFactory} from "../../src/core/PlenumFactory.sol";
import {Plenum} from "../../src/core/Plenum.sol";
import {Mandate} from "../../src/core/Mandate.sol";
import {ManagerGateway} from "../../src/core/ManagerGateway.sol";

contract FactoryTest is Fixture {
    function test_bundleIsWired() public view {
        assertEq(plenum.organizer(), ana);
        assertEq(plenum.asset(), address(usd));
        assertEq(factory.asset(), address(usd));
        assertEq(mandate.plenum(), address(plenum));
        assertEq(ManagerGateway(gateway).manager(), manager);
        assertEq(ManagerGateway(gateway).plenum(), address(plenum));
        assertTrue(mandate.isAllowed(address(tbill)));
    }

    function test_anyoneCanStartAGroup() public {
        vm.prank(stranger);
        Plenum own = Plenum(factory.createPlenum("Solo", 1, balanced(), manager));
        assertEq(own.organizer(), stranger);
    }

    function test_zeroManagerRejected() public {
        vm.expectRevert(PlenumFactory.ZeroManager.selector);
        factory.createPlenum("Nope", 1, balanced(), address(0));
    }

    function test_clonesCannotBeReinitialized() public {
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        mandate.initialize(address(1), address(oracle), governance, balanced());
    }

    function test_implementationsAreLocked() public {
        Mandate impl = Mandate(factory.mandateImpl());
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        impl.initialize(address(1), address(oracle), governance, balanced());
    }

    function test_eachGroupGetsItsOwnBundle() public {
        vm.prank(jonas);
        Plenum other = Plenum(factory.createPlenum("Berlin", 0, balanced(), manager));
        assertTrue(address(other) != address(plenum));
        assertTrue(other.mandate() != plenum.mandate());
        assertEq(other.organizer(), jonas);
    }
}
