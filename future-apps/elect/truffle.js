//module.exports = require("@aragon/os/truffle-config")


/*
 * NB: since truffle-hdwallet-provider 0.0.5 you must wrap HDWallet providers in a
 * function when declaring them. Failure to do so will cause commands to hang. ex:
 * ```
 * mainnet: {
 *     provider: function() {
 *       return new HDWalletProvider(mnemonic, 'https://mainnet.infura.io/<infura-key>')
 *     },
 *     network_id: '1',
 *     gas: 4500000,
 *     gasPrice: 10000000000,
 *   },
 */
var HDWalletProvider = require('truffle-hdwallet-provider');

var mnemonic = 'permit bulb infant unlock toward orphan diet three siren crowd crowd item';

module.exports = {
  networks: {
    development: {
      host: "127.0.0.1",
      port: 9545,
      network_id: "*" // Match any network id
    },
    // rinkeby: {
    //   provider: function() {
    //     return new HDWalletProvider(mnemonic, 'https://rinkeby.infura.io/v3/1446d338401b4c2da4f63960a533a88b')
    //   },
    //   network_id: '4',
    //   gas: 4500000,
    //   gasPrice: 10000000000,
    // },
    compilers: {
      solc: {
        version: "0.4.23"  // ex:  "0.4.20". (Default: Truffle's installed solc)
      }
    }
  }
};