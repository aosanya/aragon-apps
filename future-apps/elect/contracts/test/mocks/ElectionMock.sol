pragma solidity 0.4.24;

import "../../Election.sol";


contract ElectionMock is Election {
    /* Ugly hack to work around this issue:
     * https://github.com/trufflesuite/truffle/issues/569
     * https://github.com/trufflesuite/truffle/issues/737
     */
    function newElectionExt(bytes _executionScript, string _metadata)
        external
    {
        _newElection(_executionScript, _metadata);
        emit StartElection(msg.sender, _metadata);
    }

    // // _isValuePct public wrapper
    // function isValuePct(uint256 _value, uint256 _total, uint256 _pct) external pure returns (bool) {
    //     return _isValuePct(_value, _total, _pct);
    // }
}
