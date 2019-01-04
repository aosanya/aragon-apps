/*
 * SPDX-License-Identitifer:    GPL-3.0-or-later
 */

pragma solidity 0.4.24;

import "@aragon/os/contracts/apps/AragonApp.sol";
import "@aragon/os/contracts/common/IForwarder.sol";

import "@aragon/os/contracts/lib/math/SafeMath.sol";
import "@aragon/os/contracts/lib/math/SafeMath64.sol";

import "@aragon/apps-shared-minime/contracts/MiniMeToken.sol";


contract Election is IForwarder, AragonApp {
    using SafeMath for uint256;
    using SafeMath64 for uint64;

    bytes32 public constant CREATE_VOTES_ROLE = keccak256("CREATE_VOTES_ROLE");
    bytes32 public constant MODIFY_SUPPORT_ROLE = keccak256("MODIFY_SUPPORT_ROLE");
    bytes32 public constant MODIFY_QUORUM_ROLE = keccak256("MODIFY_QUORUM_ROLE");

    uint64 public constant PCT_BASE = 10 ** 18; // 0% = 0; 1% = 10^16; 100% = 10^18

    string private constant ERROR_NO_ELECTION = "VOTING_NO_ELECTION";
    string private constant ERROR_ELECTION_IS_OPEN = "VOTING_ELECTION_IS_OPEN";
    string private constant ERROR_NO_VOTING_POWER_IN_ELECTION = "VOTING_NO_VOTING_POWER_IN_ELECTION";

    string private constant ERROR_NO_VOTE = "VOTING_NO_VOTE";
    string private constant ERROR_NOT_A_CANDIDATE = "ERROR_NOT_A_CANDIDATE";
    string private constant ERROR_INIT_PCTS = "VOTING_INIT_PCTS";
    string private constant ERROR_CHANGE_SUPPORT_PCTS = "VOTING_CHANGE_SUPPORT_PCTS";
    string private constant ERROR_CHANGE_QUORUM_PCTS = "VOTING_CHANGE_QUORUM_PCTS";
    string private constant ERROR_INIT_SUPPORT_TOO_BIG = "VOTING_INIT_SUPPORT_TOO_BIG";
    string private constant ERROR_CHANGE_SUPPORT_TOO_BIG = "VOTING_CHANGE_SUPP_TOO_BIG";
    string private constant ERROR_CAN_NOT_VOTE = "VOTING_CAN_NOT_VOTE";
    string private constant ERROR_CAN_NOT_EXECUTE = "VOTING_CAN_NOT_EXECUTE";
    string private constant ERROR_CAN_NOT_FORWARD = "VOTING_CAN_NOT_FORWARD";
    string private constant ERROR_NO_VOTING_POWER = "VOTING_NO_VOTING_POWER";

    enum VoterState { Absent, Yea, Nay }

    struct Candidate {
        uint256 electionId;
        uint256 candidateId;
        string description;
        uint64 startDate;
        uint64 snapshotBlock;
        uint64 supportRequiredPct;
        uint64 minAcceptQuorumPct;
        uint256 votes;
        uint256 votingPower;
        bytes executionScript;
        mapping (address => VoterState) voters;
    }

    struct Election {
        bool executed;
        uint64 startDate;
        uint64 snapshotBlock;
        uint64 supportRequiredPct;
        uint64 minAcceptQuorumPct;
        uint256 votingPower;
        bytes executionScript;
        uint256 candidatesLength;
        mapping (uint256 => uint256) candidates;
    }

    MiniMeToken public token;
    uint64 public supportRequiredPct;
    uint64 public minAcceptQuorumPct;
    uint64 public voteTime;

    // We are mimicing an array, we use a mapping instead to make app upgrade more graceful
    mapping (uint256 => Candidate) internal candidates;
    uint256 public candidatesLength;

    mapping (uint256 => Election) internal elections;
    uint256 public electionsLength;

    event StartElection(uint256 indexed electionId, address indexed creator, string metadata);
    event StartVote(uint256 indexed candidateId, address indexed creator, string metadata);
    event CastVote(uint256 indexed candidateId, address indexed voter, bool supports, uint256 stake);
    event ExecuteElection(uint256 indexed electionId);
    event ExecuteVote(uint256 indexed candidateId);
    event ChangeSupportRequired(uint64 supportRequiredPct);
    event ChangeMinQuorum(uint64 minAcceptQuorumPct);

    modifier electionExists(uint256 _electionId) {
        require(_electionId < electionsLength, ERROR_NO_ELECTION);
        _;
    }

    modifier voteExists(uint256 _candidateId) {
        require(_candidateId < candidatesLength, ERROR_NO_VOTE);
        _;
    }

    modifier electionCandidateExists(uint256 _electionId, uint256 _candidateId) {
        require(_electionId < electionsLength, ERROR_NO_ELECTION);
        Election storage election_ = elections[_electionId];
        require(_candidateId < candidatesLength, ERROR_NO_VOTE);
        bool candidateBelongsToElection = false;
        for (uint i = 0; i < elections[_electionId].candidatesLength; i++) {
            if (elections[_electionId].candidates[i] == _candidateId) {
                candidateBelongsToElection = true;
                break;
            }
        }
        require(candidateBelongsToElection, ERROR_NOT_A_CANDIDATE);
        _;
    }


    /**
    * @notice Initialize Voting app with `_token.symbol(): string` for governance, minimum support of `@formatPct(_supportRequiredPct)`%, minimum acceptance quorum of `@formatPct(_minAcceptQuorumPct)`%, and a voting duration of `@transformTime(_voteTime)`
    * @param _token MiniMeToken Address that will be used as governance token
    * @param _supportRequiredPct Percentage of yeas in casted votes for a vote to succeed (expressed as a percentage of 10^18; eg. 10^16 = 1%, 10^18 = 100%)
    * @param _minAcceptQuorumPct Percentage of yeas in total possible votes for a vote to succeed (expressed as a percentage of 10^18; eg. 10^16 = 1%, 10^18 = 100%)
    * @param _voteTime Seconds that a vote will be open for token holders to vote (unless enough yeas or nays have been cast to make an early decision)
    */
    function initialize(
        MiniMeToken _token,
        uint64 _supportRequiredPct,
        uint64 _minAcceptQuorumPct,
        uint64 _voteTime
    )
        external
        onlyInit
    {
        initialized();

        require(_minAcceptQuorumPct <= _supportRequiredPct, ERROR_INIT_PCTS);
        require(_supportRequiredPct < PCT_BASE, ERROR_INIT_SUPPORT_TOO_BIG);

        token = _token;
        supportRequiredPct = _supportRequiredPct;
        minAcceptQuorumPct = _minAcceptQuorumPct;
        voteTime = _voteTime;
    }

    /**
    * @notice Change required support to `@formatPct(_supportRequiredPct)`%
    * @param _supportRequiredPct New required support
    */
    function changeSupportRequiredPct(uint64 _supportRequiredPct)
        external
        authP(MODIFY_SUPPORT_ROLE, arr(uint256(_supportRequiredPct), uint256(supportRequiredPct)))
    {
        require(minAcceptQuorumPct <= _supportRequiredPct, ERROR_CHANGE_SUPPORT_PCTS);
        require(_supportRequiredPct < PCT_BASE, ERROR_CHANGE_SUPPORT_TOO_BIG);
        supportRequiredPct = _supportRequiredPct;

        emit ChangeSupportRequired(_supportRequiredPct);
    }

    /**
    * @notice Change minimum acceptance quorum to `@formatPct(_minAcceptQuorumPct)`%
    * @param _minAcceptQuorumPct New acceptance quorum
    */
    function changeMinAcceptQuorumPct(uint64 _minAcceptQuorumPct)
        external
        authP(MODIFY_QUORUM_ROLE, arr(uint256(_minAcceptQuorumPct), uint256(minAcceptQuorumPct)))
    {
        require(_minAcceptQuorumPct <= supportRequiredPct, ERROR_CHANGE_QUORUM_PCTS);
        minAcceptQuorumPct = _minAcceptQuorumPct;

        emit ChangeMinQuorum(_minAcceptQuorumPct);
    }

    // /**
    // * @notice Create a new vote about "`_metadata`"
    // * @param _executionScript EVM script to be executed on approval
    // * @param _metadata Vote metadata
    // * @return candidateId Id for newly created vote
    // */
    // function newVote(bytes _executionScript, string _metadata) external auth(CREATE_VOTES_ROLE) returns (uint256 candidateId) {
    //     return _newVote(_executionScript, _metadata, true, true);
    // }

    // /**
    // * @notice Create a new vote about "`_metadata`"
    // * @param _executionScript EVM script to be executed on approval
    // * @param _metadata Vote metadata
    // * @param _castVote Whether to also cast newly created vote
    // * @param _executesIfDecided Whether to also immediately execute newly created vote if decided
    // * @return candidateId id for newly created vote
    // */
    // function newVote(bytes _executionScript, string _metadata, bool _castVote, bool _executesIfDecided)
    //     external
    //     auth(CREATE_VOTES_ROLE)
    //     returns (uint256 candidateId)
    // {
    //     return _newVote(_executionScript, _metadata, true, true);
    // }

    /**
    * @notice Vote `_supports ? 'yes' : 'no'` in vote #`_candidateId`
    * @dev Initialization check is implicitly provided by `voteExists()` as new votes can only be
    *      created via `newVote(),` which requires initialization
    * @param _candidateId Id for vote
    * @param _supports Whether voter supports the vote
    * @param _executesIfDecided Whether the vote should execute its action if it becomes decided
    */
    function vote(uint256 _candidateId, bool _supports, bool _executesIfDecided) external voteExists(_candidateId) {
        require(canVote(_candidateId, msg.sender), ERROR_CAN_NOT_VOTE);
        _vote(_candidateId, _supports, msg.sender, _executesIfDecided);
    }

    function executeElection(uint256 _electionId) external electionExists(_electionId) {
        require(canExecuteElection(_electionId), ERROR_CAN_NOT_EXECUTE);
        _executeElection(_electionId);
    }

    function isForwarder() public pure returns (bool) {
        return true;
    }

    /**
    * @notice Creates a vote to execute the desired action, and casts a support vote if possible
    * @dev IForwarder interface conformance
    * @param _evmScript Start vote with script
    */
    function forward(bytes _evmScript) public {
        require(canForward(msg.sender, _evmScript), ERROR_CAN_NOT_FORWARD);
        //_newEVote(_evmScript, "", true, true);
    }

    function canForward(address _sender, bytes) public view returns (bool) {
        // Note that `canPerform()` implicitly does an initialization check itself
        return canPerform(_sender, CREATE_VOTES_ROLE, arr());
    }

    function canVote(uint256 _candidateId, address _voter) public view voteExists(_candidateId) returns (bool) {
        Candidate storage candidate_ = candidates[_candidateId];
        return _isElectionOpen(elections[candidate_.electionId]) && token.balanceOfAt(_voter, candidate_.snapshotBlock) > 0;
    }

    function canExecuteElection(uint256 _electionId) public view electionExists(_electionId) returns (bool) {
        // ToDo MWA move the loops to single loop
        Election storage election_ = elections[_electionId];

        if (election_.executed) {
            return false;
        }

        // Voting is already decided
        uint256[] memory candidateIds = getElectionCandidateIds(_electionId);
        for (uint j = 0; j < candidateIds.length; j++) {
            if (_isValuePct(candidates[j].votes, election_.votingPower, election_.supportRequiredPct)) {
                return true;
            }
        }

        uint256 totalVotes = getTotalVotes(_electionId);

        // Election ended?
        if (_isElectionOpen(election_)) {
            return false;
        }
        // Has enough support?
        for (uint k = 0; k < candidateIds.length; k++) {
            if (_isValuePct(candidates[k].votes, totalVotes, election_.supportRequiredPct)) {
                return false;
            }
        }

        // Has min quorum?
        for (uint m = 0; m < candidateIds.length; m++) {
            if (!_isValuePct(candidates[m].votes, election_.votingPower, election_.minAcceptQuorumPct)) {
                return false;
            }
        }

        return true;
    }

    function getElection(uint256 _electionId)
        public
        view
        electionExists(_electionId)
        returns (
            bool open,
            bool executed,
            uint64 startDate,
            uint64 snapshotBlock,
            uint64 supportRequired,
            uint64 minAcceptQuorum,
            uint256 votingPower,
            uint256 votesLength,
            bytes script
        )
    {
        Election storage election_ = elections[_electionId];

        open = _isElectionOpen(election_); // should revert to isVoteOpen after refactoring
        executed = election_.executed;
        startDate = election_.startDate;
        snapshotBlock = election_.snapshotBlock;
        supportRequired = election_.supportRequiredPct;
        minAcceptQuorum = election_.minAcceptQuorumPct;
        votingPower = election_.votingPower;
        script = election_.executionScript;
        votesLength = election_.candidatesLength;
    }

    function getElectionCandidateIds(uint256 _electionId)
        public
        view
        returns (
            uint256[]
        )
    {
        uint[] memory candidateIds = new uint[](elections[_electionId].candidatesLength);
        for (uint i = 0; i < candidateIds.length; i++) {
            candidateIds[i] = elections[_electionId].candidates[i];
        }
        return candidateIds;
    }

    function getTotalVotes(uint256 _electionId)
        public
        view
        returns (
            uint256
        )
    {
        uint256 totalVotes = 0;

        uint[] memory candidateIds = new uint[](elections[_electionId].candidatesLength);
        for (uint i = 0; i < candidateIds.length; i++) {
            totalVotes = totalVotes + candidates[i].votes;
        }
        return totalVotes;
    }


    function getCandidate(uint256 _electionId, uint256 _candidateId)
        public
        view
        returns (
            bool open,
            bool executed,
            string description,
            uint64 startDate,
            uint64 snapshotBlock,
            uint64 supportRequired,
            uint64 minAcceptQuorum,
            uint256 votes,
            uint256 votingPower,
            bytes script
        )
    {
        Candidate storage candidate_ = candidates[_candidateId];
        open = _isElectionOpen(elections[candidate_.electionId]);

        executed = elections[candidate_.electionId].executed;
        description = candidate_.description;
        startDate = candidate_.startDate;
        snapshotBlock = candidate_.snapshotBlock;
        supportRequired = candidate_.supportRequiredPct;
        minAcceptQuorum = candidate_.minAcceptQuorumPct;
        votes = candidate_.votes;
        votingPower = candidate_.votingPower;
        script = candidate_.executionScript;
    }

    function getVoterState(uint256 _electionId, uint256 _candidateId, address _voter) public view electionCandidateExists(_electionId, _candidateId) returns (VoterState) {
        Candidate storage candidate_ = candidates[_candidateId];
        return candidate_.voters[_voter];
    }

    function _newElection(bytes _executionScript, string _metadata, bool _castVote, bool _executesIfDecided)
        internal
        returns (uint256 electionId)
    {

        uint256 votingPower = token.totalSupplyAt(election_.snapshotBlock);
        require(votingPower > 0, ERROR_NO_VOTING_POWER_IN_ELECTION);

        electionId = electionsLength++;
        Election storage election_ = elections[electionId];

        election_.startDate = getTimestamp64();
        election_.snapshotBlock = getBlockNumber64() - 1; // avoid double voting in this very block
        election_.supportRequiredPct = supportRequiredPct;
        election_.minAcceptQuorumPct = minAcceptQuorumPct;
        election_.votingPower = votingPower;
        election_.executionScript = _executionScript;

        emit StartElection(electionId, msg.sender, _metadata);

        // if (_castVote && canVote(candidateId, msg.sender)) {
        //     _vote(candidateId, true, msg.sender, _executesIfDecided);
        // }
    }

    // function _newVote(bytes _executionScript, string _metadata, bool _castVote, bool _executesIfDecided)
    //     internal
    //     returns (uint256 candidateId)
    // {
    //     candidateId = candidatesLength++;
    //     Candidate storage candidate_ = candidates[candidateId];
    //     candidate_.startDate = getTimestamp64();
    //     candidate_.snapshotBlock = getBlockNumber64() - 1; // avoid double voting in this very block
    //     candidate_.supportRequiredPct = supportRequiredPct;

    //     emit StartVote(candidateId, msg.sender, _metadata);

    //     if (_castVote && canVote(candidateId, msg.sender)) {
    //         _vote(candidateId, true, msg.sender, _executesIfDecided);
    //     }
    // }

    function _newElectionVote(uint256 electionId,
                              bytes _executionScript,
                              string _metadata,
                              string _description,
                              bool _castVote,
                              bool _executesIfDecided)
        internal
        returns (uint256 candidateId)
    {

        Election storage election_ = elections[electionId];

        candidateId = candidatesLength++;
        Candidate storage candidate_ = candidates[candidateId];

        candidate_.electionId = electionId;
        candidate_.candidateId = candidateId;
        candidate_.description = _description;
        candidate_.startDate = election_.startDate;
        candidate_.snapshotBlock = getBlockNumber64() - 1; // avoid double voting in this very block
        candidate_.executionScript = _executionScript;
        election_.candidates[election_.candidatesLength] = candidateId;
        election_.candidatesLength++;

        emit StartVote(candidateId, msg.sender, _metadata);

        if (_castVote && canVote(candidateId, msg.sender)) {
            _vote(candidateId, true, msg.sender, _executesIfDecided);
        }
    }

    function _vote(
        uint256 _candidateId,
        bool _supports,
        address _voter,
        bool _executesIfDecided
    ) internal
    {
        Candidate storage candidate_ = candidates[_candidateId];

        // This could re-enter, though we can assume the governance token is not malicious
        uint256 voterStake = token.balanceOfAt(_voter, candidate_.snapshotBlock);
        VoterState state = candidate_.voters[_voter];

        // If voter had previously voted, decrease count
        if (state == VoterState.Yea) {
            candidate_.votes = candidate_.votes.sub(voterStake);
        }

        if (_supports) {
            candidate_.votes = candidate_.votes.add(voterStake);
        }

        candidate_.voters[_voter] = _supports ? VoterState.Yea : VoterState.Nay;

        emit CastVote(_candidateId, _voter, _supports, voterStake);

        if (_executesIfDecided && canExecuteElection(candidate_.electionId)) {
            _executeElection(candidate_.electionId);
        }
    }

    function _executeElection(uint256 _electionId) internal {
        Election storage election_ = elections[_electionId];

        election_.executed = true;

        uint256[] memory candidateIds = getElectionCandidateIds(_electionId);

        for (uint i = 0; i < candidateIds.length; i++) {
            _executeVote(candidateIds[i], election_.executionScript);
        }
        emit ExecuteElection(_electionId);
    }

    function _executeVote(uint256 _candidateId, bytes _executionScript) internal {
        Candidate storage candidate_ = candidates[_candidateId];

        bytes memory input = new bytes(0); // TODO: Consider input for voting scripts
        runScript(candidate_.executionScript, input, new address[](0));

        emit ExecuteVote(_candidateId);
    }


    function _isElectionOpen(Election storage election_) internal view returns (bool) {
        return getTimestamp64() < election_.startDate.add(voteTime) && !election_.executed;
    }

    /**
    * @dev Calculates whether `_value` is more than a percentage `_pct` of `_total`
    */
    function _isValuePct(uint256 _value, uint256 _total, uint256 _pct) internal pure returns (bool) {
        if (_total == 0) {
            return false;
        }

        uint256 computedPct = _value.mul(PCT_BASE) / _total;
        return computedPct > _pct;
    }
}
