/*
 * SPDX-License-Identitifer:    GPL-3.0-or-later
 */

pragma solidity 0.4.24;

// import "@aragon/os/contracts/apps/AragonApp.sol";
// import "@aragon/os/contracts/common/IForwarder.sol";

// import "@aragon/os/contracts/lib/math/SafeMath.sol";
// import "@aragon/os/contracts/lib/math/SafeMath64.sol";



import "../../../apps/voting/contracts/Voting.sol";

contract Election is AragonApp  {

    struct Choice {
        string description;
        Voting choice;
    }

    bool executed;
    uint64 startDate;
    uint choiceCount;
    mapping (uint256 => Choice) public choices;

    MiniMeToken public token;
    uint64 public supportRequiredPct;
    uint64 public minAcceptQuorumPct;
    uint64 public voteTime;


    using SafeMath for uint256;
    using SafeMath64 for uint64;

    event StartElection(address indexed creator, string metadata);

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

        token = _token;
        supportRequiredPct = _supportRequiredPct;
        minAcceptQuorumPct = _minAcceptQuorumPct;
        voteTime = _voteTime;
        choiceCount = 0;
    }

    function addChoice(
        string _choice
    )
        external
    {
        choiceCount = choiceCount + 1;
        Choice storage choice_ = choices[choiceCount];
        choice_.description = _choice;
        choice_.choice.initialize(token, supportRequiredPct, minAcceptQuorumPct, voteTime);
    }

    function getElection()
        public
        view
        returns (
            bool _open,
            bool _executed,
            uint64 _startDate,
            uint64 _supportRequired,
            uint64 _minAcceptQuorum,
            uint _choiceCount
        )
    {
        _open = _isElectionOpen();
        _executed = executed;
        _startDate = startDate;
        _supportRequired = supportRequiredPct;
        _minAcceptQuorum = minAcceptQuorumPct;
        _choiceCount = choiceCount;
    }

        /**
    * @notice Create a new vote about "`_metadata`"
    * @param _executionScript EVM script to be executed on approval
    * @param _metadata Vote metadata
    */
    function newElection(bytes _executionScript, string _metadata)
        external
    {
        return _newElection(_executionScript, _metadata);
    }

    function _newElection(bytes _executionScript, string _metadata)
        internal
    {
        startDate = getTimestamp64();
        emit StartElection(msg.sender, _metadata);
    }

    function _isElectionOpen() internal view returns (bool) {
        return getTimestamp64() < startDate.add(voteTime) && !executed;
    }


}
