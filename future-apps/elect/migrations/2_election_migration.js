var Election = artifacts.require("Election");

module.exports = function(deployer, network) {
    console.log(network)
    deployer.deploy(Election);
};