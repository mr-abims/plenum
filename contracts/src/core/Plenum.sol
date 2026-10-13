// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IPlenum} from "../interfaces/IPlenum.sol";
import {IMandate} from "../interfaces/IMandate.sol";
import {INavOracle} from "../interfaces/INavOracle.sol";
import {IAssetAdapter} from "../interfaces/IAssetAdapter.sol";
import {Action, Op, PolicyViolation, Reason, Unauthorized} from "../interfaces/Types.sol";

/// @title Plenum
/// @notice One group's members, non-transferable units and custody of the settlement asset. Executes actions only when called
///         by its ManagerGateway or Governance, after their checks pass. Deployed as a minimal-proxy clone.
/// @dev Pricing (SPEC §7, A8): units = assets × (U + 10^6) / (V + 1); assets = units × (V + 1) / (U + 10^6),
///      with V = latest NAV + net flows since that report, and V = 0 while U = 0 (bootstrap).
///      Invites (SPEC A16): EIP-712 `Invite(invitee, nonce, expiry)` signed by the organizer or any member;
///      invitee = address(0) makes an open single-use link, otherwise only that address may use it.
///      Exits (SPEC A26): outside the free window at each period end an exit pays `Mandate.exitFeeBps()` of its gross
///      value; `protocolFeeCutBps` of the fee goes to the treasury (all of it when the exit empties the plenum or the
///      plenum has one member) and the rest stays in the pool, shared pro-rata by the remaining units.
contract Plenum is IPlenum, Initializable, EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 internal constant OFFSET = 1e6; // 10^δ, δ = 6
    uint256 internal constant BPS = 10_000;
    uint256 internal constant WHOLE_UNIT = 1e12; // units have 12 decimals
    bytes32 public constant INVITE_TYPEHASH = keccak256("Invite(address invitee,uint256 nonce,uint64 expiry)");

    string public name;
    address public asset;
    address public mandate;
    address public governance;
    address public gateway;
    address public navOracle;
    address public organizer;
    address public treasury;
    uint16 public protocolFeeCutBps;
    /// @notice True once the organizer has left; from then on only current members can sign invites.
    bool public organizerLeft;

    uint256 public override totalUnits;
    uint256 public override memberCount;
    mapping(address => uint256) public override unitsOf;
    mapping(address => bool) public override isMember;
    mapping(address => bytes32) public encPubKeyOf;
    mapping(uint256 => bool) public inviteUsed;
    /// @dev Bounded by MandateConfig.maxMembers (≤ 99); never iterated in state-changing code.
    address[] internal _members;
    /// @dev Position in `_members` plus one (0 = not listed), so leaving is O(1).
    mapping(address => uint256) internal _memberIndex;

    /// @dev NAV race handling (SPEC A8): flows since the last NAV report this plenum has seen.
    uint64 public lastNavTimestamp;
    int256 public netFlowSince;

    error ZeroAmount();
    error AlreadyMember(address account);
    error NotMember(address account);
    error InviteExpired(uint64 expiry);
    error InviteAlreadyUsed(uint256 nonce);
    error InviteNotForCaller(address invitee);
    error InvalidInviteSigner(address signer);
    error InsufficientUnits(uint256 requested, uint256 held);

    constructor() EIP712("Plenum", "1") {
        _disableInitializers();
    }

    /// @inheritdoc IPlenum
    function initialize(InitParams calldata p) external initializer {
        name = p.name;
        asset = p.asset;
        mandate = p.mandate;
        governance = p.governance;
        gateway = p.gateway;
        navOracle = p.navOracle;
        organizer = p.organizer;
        treasury = p.treasury;
        protocolFeeCutBps = p.protocolFeeCutBps;
    }

    /// @inheritdoc IPlenum
    /// @dev `invite` = abi.encode(address invitee, uint256 nonce, uint64 expiry, bytes signature). The signed invite
    ///      is the admission control (SPEC A25): only the organizer or an existing member can let someone in.
    function join(bytes calldata invite, bytes32 encPubKey) external nonReentrant {
        if (isMember[msg.sender]) revert AlreadyMember(msg.sender);
        (address invitee, uint256 nonce, uint64 expiry, bytes memory sig) =
            abi.decode(invite, (address, uint256, uint64, bytes));
        if (block.timestamp > expiry) revert InviteExpired(expiry);
        if (inviteUsed[nonce]) revert InviteAlreadyUsed(nonce);
        if (invitee != address(0) && invitee != msg.sender) revert InviteNotForCaller(invitee);
        address signer = ECDSA.recover(inviteDigest(invitee, nonce, expiry), sig);
        if (!isMember[signer] && (signer != organizer || organizerLeft)) revert InvalidInviteSigner(signer);

        if (memberCount >= IMandate(mandate).maxMembers()) revert PolicyViolation(Reason.MEMBER_CAP);

        inviteUsed[nonce] = true;
        isMember[msg.sender] = true;
        encPubKeyOf[msg.sender] = encPubKey;
        _members.push(msg.sender);
        _memberIndex[msg.sender] = _members.length;
        ++memberCount;
        emit MemberJoined(msg.sender, encPubKey);
    }

    /// @notice EIP-712 digest an inviter signs.
    function inviteDigest(address invitee, uint256 nonce, uint64 expiry) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(INVITE_TYPEHASH, invitee, nonce, expiry)));
    }

    /// @inheritdoc IPlenum
    function contribute(uint256 assets) external nonReentrant returns (uint256 units) {
        if (assets == 0) revert ZeroAmount();
        if (!isMember[msg.sender]) revert NotMember(msg.sender);

        uint256 u = totalUnits;
        uint256 v = u == 0 ? 0 : _navValue();
        units = Math.mulDiv(assets, u + OFFSET, v + 1);
        if (units == 0) revert ZeroAmount();
        uint256 navPerUnit = Math.mulDiv(v + 1, WHOLE_UNIT, u + OFFSET);

        totalUnits = u + units;
        unitsOf[msg.sender] += units;
        netFlowSince += SafeCast.toInt256(assets);
        IERC20(asset).safeTransferFrom(msg.sender, address(this), assets);
        emit Contributed(msg.sender, assets, units, navPerUnit);
    }

    /// @inheritdoc IPlenum
    /// @dev Paid from cash only (a redemption queue is stretch).
    function redeem(uint256 units, address to) external nonReentrant returns (uint256 assets) {
        if (units == 0) revert ZeroAmount();
        assets = _redeem(units, to);
    }

    /// @inheritdoc IPlenum
    function leave(address to) external nonReentrant returns (uint256 assets) {
        if (!isMember[msg.sender]) revert NotMember(msg.sender);
        uint256 units = unitsOf[msg.sender];
        if (units != 0) assets = _redeem(units, to);

        uint256 idx = _memberIndex[msg.sender] - 1;
        address last = _members[_members.length - 1];
        _members[idx] = last;
        _memberIndex[last] = idx + 1;
        _members.pop();
        delete _memberIndex[msg.sender];
        isMember[msg.sender] = false;
        delete encPubKeyOf[msg.sender];
        --memberCount;
        if (msg.sender == organizer) organizerLeft = true;
        emit MemberLeft(msg.sender);
    }

    /// @dev Burns `units` of the caller and pays the gross value less the breaking fee. Reverts with no state change
    ///      if cash can't cover what leaves the plenum (payout plus the treasury's cut).
    function _redeem(uint256 units, address to) internal returns (uint256 payout) {
        uint256 held = unitsOf[msg.sender];
        if (units > held) revert InsufficientUnits(units, held);

        uint256 u = totalUnits;
        uint256 gross = Math.mulDiv(units, _navValue() + 1, u + OFFSET);
        uint256 fee = gross * IMandate(mandate).exitFeeBps() / BPS;
        uint256 toTreasury = (memberCount <= 1 || units == u) ? fee : fee * protocolFeeCutBps / BPS;
        payout = gross - fee;
        uint256 leaving = payout + toTreasury;
        if (leaving > cash()) revert PolicyViolation(Reason.LIQUIDITY_FLOOR);

        unitsOf[msg.sender] = held - units;
        totalUnits = u - units;
        netFlowSince -= SafeCast.toInt256(leaving);
        IERC20(asset).safeTransfer(to, payout);
        if (toTreasury != 0) IERC20(asset).safeTransfer(treasury, toTreasury);
        emit Redeemed(msg.sender, units, payout, to);
        if (fee != 0) emit ExitFeeCharged(msg.sender, fee, toTreasury);
    }

    /// @inheritdoc IPlenum
    /// @dev Defence in depth: re-checks the allowlist itself; policy checks happen in the caller.
    function execute(Action[] calldata actions) external nonReentrant {
        if (msg.sender != gateway && msg.sender != governance) revert Unauthorized(msg.sender);
        IMandate m = IMandate(mandate);
        for (uint256 k; k < actions.length; ++k) {
            Action calldata act = actions[k];
            if (!m.isAllowed(act.adapter)) revert PolicyViolation(Reason.ADAPTER_NOT_ALLOWED);
            IAssetAdapter adapter = IAssetAdapter(act.adapter);
            uint256 result = 0; // requestId for RequestRedeem, assets for Claim, else 0
            if (act.op == Op.Deposit) {
                IERC20(asset).forceApprove(act.adapter, act.assets);
                adapter.deposit(act.assets);
                IERC20(asset).forceApprove(act.adapter, 0);
            } else if (act.op == Op.Withdraw) {
                adapter.withdraw(act.assets);
            } else if (act.op == Op.RequestRedeem) {
                result = adapter.requestRedeem(act.assets);
            } else {
                result = adapter.claim(act.assets);
            }
            emit ActionExecuted(act.adapter, act.op, act.assets, result);
        }
    }

    /// @inheritdoc IPlenum
    function members() external view returns (address[] memory) {
        return _members;
    }

    /// @inheritdoc IPlenum
    function cash() public view returns (uint256) {
        return IERC20(asset).balanceOf(address(this));
    }

    /// @notice V used for pricing: latest NAV plus net flows since it. Read-only twin of `_navValue`.
    function currentNav() external view returns (uint256 v, bool fresh) {
        INavOracle.NavReport memory r = INavOracle(navOracle).latest(address(this));
        int256 flows = r.timestamp > lastNavTimestamp ? int256(0) : netFlowSince;
        int256 value = SafeCast.toInt256(r.nav) + flows;
        v = value > 0 ? SafeCast.toUint256(value) : 0;
        fresh = r.timestamp != 0 && block.timestamp <= uint256(r.timestamp) + IMandate(mandate).navMaxAge();
    }

    /// @dev Adopts a newer report (resetting net flows), enforces freshness, returns V.
    function _navValue() internal returns (uint256) {
        INavOracle.NavReport memory r = INavOracle(navOracle).latest(address(this));
        if (r.timestamp > lastNavTimestamp) {
            lastNavTimestamp = r.timestamp;
            netFlowSince = 0;
        }
        if (r.timestamp == 0 || block.timestamp > uint256(r.timestamp) + IMandate(mandate).navMaxAge()) {
            revert PolicyViolation(Reason.NAV_STALE);
        }
        int256 value = SafeCast.toInt256(r.nav) + netFlowSince;
        return value > 0 ? SafeCast.toUint256(value) : 0;
    }
}
