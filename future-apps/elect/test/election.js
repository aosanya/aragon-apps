const sha3 = require('solidity-sha3').default

const { assertRevert } = require('@aragon/test-helpers/assertThrow')
const getBlockNumber = require('@aragon/test-helpers/blockNumber')(web3)
const timeTravel = require('@aragon/test-helpers/timeTravel')(web3)
const { encodeCallScript, EMPTY_SCRIPT } = require('@aragon/test-helpers/evmScript')
const ExecutionTarget = artifacts.require('ExecutionTarget')

const DAOFactory = artifacts.require('@aragon/os/contracts/factory/DAOFactory')
const EVMScriptRegistryFactory = artifacts.require('@aragon/os/contracts/factory/EVMScriptRegistryFactory')
const ACL = artifacts.require('@aragon/os/contracts/acl/ACL')
const Kernel = artifacts.require('@aragon/os/contracts/kernel/Kernel')

const MiniMeToken = artifacts.require('@aragon/apps-shared-minime/contracts/MiniMeToken')

const Election = artifacts.require('ElectionMock')

const getContract = name => artifacts.require(name)
const bigExp = (x, y) => new web3.BigNumber(x).times(new web3.BigNumber(10).toPower(y))
const pct16 = x => bigExp(x, 16)
const startElectionEvent = receipt => receipt.logs.filter(x => x.event == 'StartElection')[0].args
const createdVoteId = receipt => startElectionEvent(receipt).voteId

const ANY_ADDR = '0xffffffffffffffffffffffffffffffffffffffff'
const NULL_ADDRESS = '0x00'

const VOTER_STATE = ['ABSENT', 'YEA', 'NAY'].reduce((state, key, index) => {
    state[key] = index;
    return state;
}, {})


contract('Election App', accounts => {
    let votingBase, daoFact, election, token, executionTarget

    let APP_MANAGER_ROLE
    let CREATE_VOTES_ROLE, MODIFY_SUPPORT_ROLE, MODIFY_QUORUM_ROLE

    const votingTime = 1000
    const root = accounts[0]

    before(async () => {
        const kernelBase = await getContract('Kernel').new(true) // petrify immediately
        const aclBase = await getContract('ACL').new()
        const regFact = await EVMScriptRegistryFactory.new()
        daoFact = await DAOFactory.new(kernelBase.address, aclBase.address, regFact.address)
        votingBase = await Election.new()

        // Setup constants
        APP_MANAGER_ROLE = await kernelBase.APP_MANAGER_ROLE()
    })

    beforeEach(async () => {
        const r = await daoFact.newDAO(root)
        const dao = Kernel.at(r.logs.filter(l => l.event == 'DeployDAO')[0].args.dao)
        const acl = ACL.at(await dao.acl())

        await acl.createPermission(root, dao.address, APP_MANAGER_ROLE, root, { from: root })

        const receipt = await dao.newAppInstance('0x1234', votingBase.address, '0x', false, { from: root })
        election = Election.at(receipt.logs.filter(l => l.event == 'NewAppProxy')[0].args.proxy)

        // await acl.createPermission(ANY_ADDR, election.address, CREATE_VOTES_ROLE, root, { from: root })
        // await acl.createPermission(ANY_ADDR, election.address, MODIFY_SUPPORT_ROLE, root, { from: root })
        // await acl.createPermission(ANY_ADDR, election.address, MODIFY_QUORUM_ROLE, root, { from: root })
    })

    context('normal token supply, common tests', () => {
        const neededSupport = pct16(50)
        const minimumAcceptanceQuorum = pct16(20)

        beforeEach(async () => {
            token = await MiniMeToken.new(NULL_ADDRESS, NULL_ADDRESS, 0, 'n', 0, 'n', true) // empty parameters minime

            await election.initialize(token.address, neededSupport, minimumAcceptanceQuorum, votingTime)

            executionTarget = await ExecutionTarget.new()
        })

    })

    for (const decimals of [0, 2, 18, 26]) {
        context(`normal token supply, ${decimals} decimals`, () => {
            const holder20 = accounts[0]
            const holder29 = accounts[1]
            const holder51 = accounts[2]
            const nonHolder = accounts[4]

            const neededSupport = pct16(50)
            const minimumAcceptanceQuorum = pct16(20)

            beforeEach(async () => {
                token = await MiniMeToken.new(NULL_ADDRESS, NULL_ADDRESS, 0, 'n', decimals, 'n', true) // empty parameters minime

                await token.generateTokens(holder20, bigExp(20, decimals))
                await token.generateTokens(holder29, bigExp(29, decimals))
                await token.generateTokens(holder51, bigExp(51, decimals))

                await election.initialize(token.address, neededSupport, minimumAcceptanceQuorum, votingTime)

                executionTarget = await ExecutionTarget.new()
            })

            context('creating election', () => {
                let script, creator, metadata, choiceCount

                beforeEach(async () => {
                    const action = { to: executionTarget.address, calldata: executionTarget.contract.execute.getData() }
                    script = encodeCallScript([action, action])
                    const startElection = startElectionEvent(await election.newElectionExt(script, 'metadata', { from: holder51 }))
                    creator = startElection.creator
                    metadata = startElection.metadata
                    console.log('add Choice')

                    try{
                        await election.addChoice('Good Choice')
                        await election.addChoice('Better Choice')
                        await election.addChoice('Best Choice')
                    }
                    catch (error){

                        console.log(error)
                    }



                })

                it('has correct state', async () => {
                    const [isOpen, isExecuted, startDate, supportRequired, minQuorum, choiceCount ] = await election.getElection()
                    console.log("       Election Started at " + startDate) // Why is this 0
                    assert.isTrue(isOpen, 'vote should be open')
                    assert.isFalse(isExecuted, 'vote should not be executed')
                    assert.equal(creator, holder51, 'creator should be correct')
                    assert.equal(supportRequired.toNumber(), neededSupport.toNumber(), 'required support should be app required support')
                    assert.equal(minQuorum.toNumber(), minimumAcceptanceQuorum.toNumber(), 'min quorum should be app min quorum')
                    assert.equal(metadata, 'metadata', 'should have returned correct metadata')
                    assert.equal(choiceCount, 3, 'should have the correct number of choices')
                    const choice1 = await election.choices(1)
                    assert.equal(choice1[0], 'Good Choice', 'should have the correct choice 1')
                    const choice2 = await election.choices(2)
                    assert.equal(choice2[0], 'Better Choice', 'should have the correct choice 2')
                    const choice3 = await election.choices(3)
                    assert.equal(choice3[0], 'Best Choice', 'should have the correct choice 3')
                    console.log(choice3[0])
                })


            })
        })
    }



})
