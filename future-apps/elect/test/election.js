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
const startVoteEvent = receipt => receipt.logs.filter(x => x.event == 'StartVote')[0].args
const startElectionEvent = receipt => receipt.logs.filter(x => x.event == 'StartElection')[0].args
const createdVoteId = receipt => startVoteEvent(receipt).voteId

const ANY_ADDR = '0xffffffffffffffffffffffffffffffffffffffff'
const NULL_ADDRESS = '0x00'

const VOTER_STATE = ['ABSENT', 'YEA', 'NAY'].reduce((state, key, index) => {
    state[key] = index;
    return state;
}, {})


contract('Election App', accounts => {
    let votingBase, daoFact, voting, token, executionTarget

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
        CREATE_VOTES_ROLE = await votingBase.CREATE_VOTES_ROLE()
        MODIFY_SUPPORT_ROLE = await votingBase.MODIFY_SUPPORT_ROLE()
        MODIFY_QUORUM_ROLE = await votingBase.MODIFY_QUORUM_ROLE()
    })

    beforeEach(async () => {
        const r = await daoFact.newDAO(root)
        const dao = Kernel.at(r.logs.filter(l => l.event == 'DeployDAO')[0].args.dao)
        const acl = ACL.at(await dao.acl())

        await acl.createPermission(root, dao.address, APP_MANAGER_ROLE, root, { from: root })

        const receipt = await dao.newAppInstance('0x1234', votingBase.address, '0x', false, { from: root })
        voting = Election.at(receipt.logs.filter(l => l.event == 'NewAppProxy')[0].args.proxy)

        await acl.createPermission(ANY_ADDR, voting.address, CREATE_VOTES_ROLE, root, { from: root })
        await acl.createPermission(ANY_ADDR, voting.address, MODIFY_SUPPORT_ROLE, root, { from: root })
        await acl.createPermission(ANY_ADDR, voting.address, MODIFY_QUORUM_ROLE, root, { from: root })
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

                await voting.initialize(token.address, neededSupport, minimumAcceptanceQuorum, votingTime)

                executionTarget = await ExecutionTarget.new()
            })

            // it('create new election', async () => {
            //     const action = { to: executionTarget.address, calldata: executionTarget.contract.execute.getData() }
            //     const script = encodeCallScript([action])
            //     await voting.newElection(script, '', { from: root})

            // })

            // it('deciding voting is automatically executed (long version)', async () => {
            //     const action = { to: executionTarget.address, calldata: executionTarget.contract.execute.getData() }
            //     const script = encodeCallScript([action])
            //     await voting.newVoteExt(script, '', true, true, { from: holder51 })
            //     assert.equal(await executionTarget.counter(), 1, 'should have received execution call')
            // })

            // it('execution scripts can execute multiple actions', async () => {
            //     const action = { to: executionTarget.address, calldata: executionTarget.contract.execute.getData() }
            //     const script = encodeCallScript([action, action, action])
            //     await voting.newVote(script, '', { from: holder51 })
            //     assert.equal(await executionTarget.counter(), 3, 'should have executed multiple times')
            // })

            // it('execution script can be empty', async () => {
            //     await voting.newVote(encodeCallScript([]), '', { from: holder51 })
            // })

            // it('execution throws if any action on script throws', async () => {
            //     const action = { to: executionTarget.address, calldata: executionTarget.contract.execute.getData() }
            //     let script = encodeCallScript([action])
            //     script = script.slice(0, -2) // remove one byte from calldata for it to fail
            //     return assertRevert(async () => {
            //         await voting.newVote(script, '', { from: holder51 })
            //     })
            // })

            // it('forwarding creates vote', async () => {
            //     const action = { to: executionTarget.address, calldata: executionTarget.contract.execute.getData() }
            //     const script = encodeCallScript([action])
            //     const voteId = createdVoteId(await voting.forward(script, { from: holder51 }))
            //     assert.equal(voteId, 0, 'voting should have been created')
            // })
        })
    }

    for (const decimals of [2]) {
    // for (const decimals of [0, 2, 18, 26]) {
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

                await voting.initialize(token.address, neededSupport, minimumAcceptanceQuorum, votingTime)

                executionTarget = await ExecutionTarget.new()
            })

            context('creating election', () => {
                let script, electionId, creator, electionMetadata
                let voteId1, voteId2, voteMetadata1

                beforeEach(async () => {
                    const action = { to: executionTarget.address, calldata: executionTarget.contract.execute.getData() }
                    script = encodeCallScript([action, action])

                    const startElection = startElectionEvent(await voting.newElectionExt(script, 'electionMetadata', false, false, { from: holder51 }))
                    electionId = startElection.electionId
                    creator = startElection.creator
                    electionMetadata = startElection.metadata

                    const startVote1 = startVoteEvent(await voting.newElectionVoteExt(electionId, script, 'metadata1', 'Good Choice', false, false, { from: holder51 }))
                    voteId1 = startVote1.voteId
                    voteMetadata1 = startVote1.metadata

                    const startVote2 = startVoteEvent(await voting.newElectionVoteExt(electionId, script, 'metadata2', 'Better Choice', false, false, { from: holder51 }))
                    voteId2 = startVote2.voteId
                    voteMetadata2 = startVote2.metadata

                })

                it('election has correct state', async () => {
                    const [isOpen, isExecuted, startDate, snapshotBlock, supportRequired, minQuorum, votingPower, votesLength, execScript] = await voting.getElection(electionId)
                    assert.equal(await voting.electionsLength(), 1, 'Should have correct count of elections')
                    assert.equal(await voting.votesLength(), 2, 'Should have correct count of candidates')
                    assert.isTrue(isOpen, 'election should be open')
                    assert.isFalse(isExecuted, 'election should not be executed')
                    assert.equal(creator, holder51, 'creator should be correct')
                    assert.equal(snapshotBlock, await getBlockNumber() - 3, 'snapshot block should be correct')
                    assert.equal(supportRequired.toNumber(), neededSupport.toNumber(), 'required support should be app required support')
                    assert.equal(minQuorum.toNumber(), minimumAcceptanceQuorum.toNumber(), 'min quorum should be app min quorum')
                    assert.equal(votingPower.toString(), bigExp(100, decimals).toString(), 'total voters should be 100')
                    assert.equal(votesLength, 2, 'number of votes should be 2')
                    const electionVoteIds = await voting.getElectionVoteIds(electionId);
                    assert.equal(electionVoteIds[0], 0, 'vote Id 1 should be correct')
                    assert.equal(electionVoteIds[1], 1, 'vote Id 2 should be correct')
                    //assert.equal(votingId, await voting.elections[0], 'snapshot block should be correct')
                    assert.equal(execScript, script, 'script should be correct')
                    //Todo MWA Add Support req here
                    assert.equal(electionMetadata, 'electionMetadata', 'should have returned correct metadata')
                })

                // it('vote1 has correct state', async () => {
                //     const [isOpen, isExecuted, candidate, startDate, snapshotBlock, minQuorum, votingPower, execScript] = await voting.getVote(voteId1)

                //     assert.isTrue(isOpen, 'vote should be open')
                //     assert.equal(candidate, 'Good Choice', 'should have returned correct candidate')
                //     assert.isFalse(isExecuted, 'vote should not be executed')
                //     assert.equal(creator, holder51, 'creator should be correct')
                //     assert.equal(snapshotBlock, await getBlockNumber() - 2, 'snapshot block should be correct')
                //     assert.equal(voteMetadata1, 'metadata1', 'should have returned correct metadata')
                // })

                // it('vote2 has correct state', async () => {
                //     const [isOpen, isExecuted, candidate, startDate, snapshotBlock, minQuorum, votingPower, execScript] = await voting.getVote(voteId2)

                //     assert.isTrue(isOpen, 'vote should be open')
                //     assert.equal(candidate, 'Better Choice', 'should have returned correct candidate')
                //     assert.isFalse(isExecuted, 'vote should not be executed')
                //     assert.equal(creator, holder51, 'creator should be correct')
                //     assert.equal(snapshotBlock, await getBlockNumber() - 1, 'snapshot block should be correct')
                //     assert.equal(voteMetadata2, 'metadata2', 'should have returned correct metadata')
                // })



                // it('fails getting a election out of bounds', async () => {
                //     return assertRevert(async () => {
                //         await voting.getElection(electionId + 1)
                //     })
                // })

                // it('holder can vote', async () => {
                //     await voting.vote(voteId1, false, true, { from: holder29 })
                //     const state = await voting.getVote(voteId1)
                //     const voterState = await voting.getVoterState(voteId1, holder29)

                //     assert.equal(state[8].toString(), bigExp(29, decimals).toString(), 'nay vote should have been counted')
                //     assert.equal(voterState, VOTER_STATE.NAY, 'holder29 should have nay voter status')
                // })

                // it('holder can modify vote', async () => {
                //     await voting.vote(voteId1, true, true, { from: holder29 })
                //     await voting.vote(voteId1, false, true, { from: holder29 })
                //     await voting.vote(voteId1, true, true, { from: holder29 })
                //     const state = await voting.getVote(voteId1)

                //     assert.equal(state[7].toString(), bigExp(29, decimals).toString(), 'yea vote should have been counted')
                //     assert.equal(state[8], 0, 'nay vote should have been removed')
                // })

                // it('token transfers dont affect voting', async () => {
                //     await token.transfer(nonHolder, bigExp(29, decimals), { from: holder29 })

                //     await voting.vote(voteId1, true, true, { from: holder29 })
                //     const state = await voting.getVote(voteId1)

                //     assert.equal(state[7].toString(), bigExp(29, decimals).toString(), 'yea vote should have been counted')
                //     assert.equal(await token.balanceOf(holder29), 0, 'balance should be 0 at current block')
                // })

                // it('throws when non-holder votes', async () => {
                //     return assertRevert(async () => {
                //         await voting.vote(voteId1, true, true, { from: nonHolder })
                //     })
                // })

                // it('throws when voting after voting closes', async () => {
                //     await timeTravel(votingTime + 1)
                //     return assertRevert(async () => {
                //         await voting.vote(voteId1, true, true, { from: holder29 })
                //     })
                // })

                // it('can execute if vote is approved with support and quorum', async () => {
                //     await voting.vote(voteId, true, true, { from: holder29 })
                //     await voting.vote(voteId, false, true, { from: holder20 })
                //     await timeTravel(votingTime + 1)
                //     await voting.executeVote(electionId)
                //     assert.equal(await executionTarget.counter(), 2, 'should have executed result')
                // })












                // it('cannot execute vote if not enough quorum met', async () => {
                //     await voting.vote(voteId, true, true, { from: holder20 })
                //     await timeTravel(votingTime + 1)
                //     return assertRevert(async () => {
                //         await voting.executeVote(voteId)
                //     })
                // })

                // it('cannot execute vote if not support met', async () => {
                //     await voting.vote(voteId, false, true, { from: holder29 })
                //     await voting.vote(voteId, false, true, { from: holder20 })
                //     await timeTravel(votingTime + 1)
                //     return assertRevert(async () => {
                //         await voting.executeVote(voteId)
                //     })
                // })

                it('vote can be executed automatically if decided', async () => {
                    await voting.vote(voteId1, true, true, { from: holder51 }) // causes execution
                    assert.equal(await executionTarget.counter(), 2, 'should have executed result')
                })

                // it('vote can be not executed automatically if decided', async () => {
                //     await voting.vote(voteId, true, false, { from: holder51 }) // doesnt cause execution
                //     await voting.executeVote(voteId)
                //     assert.equal(await executionTarget.counter(), 2, 'should have executed result')
                // })

                // it('cannot re-execute vote', async () => {
                //     await voting.vote(voteId, true, true, { from: holder51 }) // causes execution
                //     return assertRevert(async () => {
                //         await voting.executeVote(voteId)
                //     })
                // })

                // it('cannot vote on executed vote', async () => {
                //     await voting.vote(voteId, true, true, { from: holder51 }) // causes execution
                //     return assertRevert(async () => {
                //         await voting.vote(voteId, true, true, { from: holder20 })
                //     })
                // })
            })
        })
    }


})
