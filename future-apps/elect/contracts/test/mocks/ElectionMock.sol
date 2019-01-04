pragma solidity 0.4.24;

import "../../Election.sol";


contract ElectionMock is Election {
    /* Ugly hack to work around this issue:
     * https://github.com/trufflesuite/truffle/issues/569
     * https://github.com/trufflesuite/truffle/issues/737
     */
    // function newVoteExt(bytes _executionScript, string _metadata, bool _castVote, bool _executesIfDecided)
    //     external
    //     returns (uint256 voteId)
    // {
    //     voteId = _newVote(_executionScript, _metadata, _castVote, _executesIfDecided);
    //     emit StartVote(voteId, msg.sender, _metadata);
    // }

    function newElectionVoteExt(uint256 _electionId, bytes _executionScript, string _metadata, string _candidate,
                                bool _castVote, bool _executesIfDecided)
        external
        returns (uint256 voteId)
    {
        voteId = _newElectionVote(_electionId, _executionScript, _metadata, _candidate, _castVote, _executesIfDecided);
        emit StartVote(voteId, msg.sender, _metadata);
    }

    function newElectionExt(bytes _executionScript, string _metadata, bool _castVote, bool _executesIfDecided)
        external
        returns (uint256 electionId)
    {
        electionId = _newElection(_executionScript, _metadata, _castVote, _executesIfDecided);
        emit StartElection(electionId, msg.sender, _metadata);
    }

    // _isValuePct public wrapper
    function isValuePct(uint256 _value, uint256 _total, uint256 _pct) external pure returns (bool) {
        return _isValuePct(_value, _total, _pct);
    }
}
