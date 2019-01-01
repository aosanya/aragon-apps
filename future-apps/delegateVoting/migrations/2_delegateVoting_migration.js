var DelegateVoting = artifacts.require("DelegateVoting");

module.exports = function(deployer, network) {
    console.log(network)
    deployer.deploy(DelegateVoting);
};