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
const createdCandidateId = receipt => startVoteEvent(receipt).candidateId

const ANY_ADDR = '0xffffffffffffffffffffffffffffffffffffffff'
const NULL_ADDRESS = '0x00'

const VOTER_STATE = ['NAY', 'YEA'].reduce((state, key, index) => {
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
            //     const candidateId = createdCandidateId(await voting.forward(script, { from: holder51 }))
            //     assert.equal(candidateId, 0, 'voting should have been created')
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
                let script, electionId1, creator, electionMetadata
                let candidateId1, candidateId2, voteMetadata1

                beforeEach(async () => {
                    const action = { to: executionTarget.address, calldata: executionTarget.contract.execute.getData() }
                    script = encodeCallScript([action, action])

                    const startElection = startElectionEvent(await voting.newElectionExt(script, 'electionMetadata',{ from: holder51 }))
                    electionId1 = startElection.electionId
                    creator = startElection.creator
                    electionMetadata = startElection.metadata

                    const startVote1 = startVoteEvent(await voting.newElectionCandidateExt(electionId1, script, 'metadata1', 'Good Choice', { from: holder51 }))
                    candidateId1 = startVote1.candidateId
                    voteMetadata1 = startVote1.metadata

                    const startVote2 = startVoteEvent(await voting.newElectionCandidateExt(electionId1, script, 'metadata2', 'Better Choice', { from: holder51 }))
                    candidateId2 = startVote2.candidateId
                    voteMetadata2 = startVote2.metadata

                })

                it('election has correct state', async () => {
                    const [isOpen, isExecuted, startDate, snapshotBlock, supportRequired, minQuorum, votingPower, votesLength, execScript] = await voting.getElection(electionId1)
                    assert.equal(await voting.electionsLength(), 1, 'Should have correct count of elections')
                    assert.isTrue(isOpen, 'election should be open')
                    assert.isFalse(isExecuted, 'election should not be executed')
                    assert.equal(creator, holder51, 'creator should be correct')
                    assert.equal(snapshotBlock, await getBlockNumber() - 3, 'snapshot block should be correct')
                    assert.equal(supportRequired.toNumber(), neededSupport.toNumber(), 'required support should be app required support')
                    assert.equal(minQuorum.toNumber(), minimumAcceptanceQuorum.toNumber(), 'min quorum should be app min quorum')
                    assert.equal(votingPower.toString(), bigExp(100, decimals).toString(), 'total voters should be 100')
                    assert.equal(votesLength, 2, 'number of votes should be 2')
                    //assert.equal(votingId, await voting.elections[0], 'snapshot block should be correct')
                    assert.equal(execScript, script, 'script should be correct')
                    //Todo MWA Add Support req here
                    assert.equal(electionMetadata, 'electionMetadata', 'should have returned correct metadata')
                })

                it('candidate 1 has correct state', async () => {

                    const [isOpen, isExecuted, candidate, startDate, snapshotBlock, minQuorum] = await voting.getCandidate(electionId1, candidateId1)

                    assert.isTrue(isOpen, 'vote should be open')
                    assert.equal(candidate, 'Good Choice', 'should have returned correct candidate')
                    assert.isFalse(isExecuted, 'vote should not be executed')
                    assert.equal(creator, holder51, 'creator should be correct')
                    assert.equal(snapshotBlock, await getBlockNumber() - 2, 'snapshot block should be correct')
                    assert.equal(voteMetadata1, 'metadata1', 'should have returned correct metadata')
                })

                it('candidate 2 has correct state', async () => {
                    const [isOpen, isExecuted, candidate, startDate, snapshotBlock, minQuorum] = await voting.getCandidate(electionId1, candidateId2)

                    assert.isTrue(isOpen, 'vote should be open')
                    assert.equal(candidate, 'Better Choice', 'should have returned correct candidate')
                    assert.isFalse(isExecuted, 'vote should not be executed')
                    assert.equal(creator, holder51, 'creator should be correct')
                    assert.equal(snapshotBlock, await getBlockNumber() - 1, 'snapshot block should be correct')
                    assert.equal(voteMetadata2, 'metadata2', 'should have returned correct metadata')
                })

                it('fails getting an election out of bounds', async () => {
                    return assertRevert(async () => {
                        await voting.getElection(electionId1 + 1)
                    })
                })

                it('holder can vote', async () => {
                    await voting.vote(candidateId1, true, true, { from: holder29 })
                    const state = await voting.getCandidate(electionId1, candidateId1)

                    assert.equal(state[7].toString(), bigExp(29, decimals).toString(), 'vote should have been counted')
                })

                it('holder can modify vote', async () => {
                    await voting.vote(candidateId1, true, true, { from: holder29 })

                    const state1 = await voting.getCandidate(electionId1, candidateId1)
                    assert.equal(state1[7].toString(), bigExp(29, decimals).toString(), 'vote should have been counted')

                    const voterState1 = await voting.getVoterState(electionId1, candidateId1, holder29)
                    assert.equal(voterState1, VOTER_STATE.YEA, 'holder29 should have yea voter status')

                    await voting.vote(candidateId1, false, true, { from: holder29 })
                    const state2 = await voting.getCandidate(electionId1, candidateId1)
                    assert.equal(state2[7].toString(), 0, 'vote should have been removed')
                    const voterState2 = await voting.getVoterState(electionId1, candidateId1, holder29)
                    assert.equal(voterState2, VOTER_STATE.NAY, 'holder29 should have nay voter status')

                    await voting.vote(candidateId1, true, true, { from: holder29 })
                    const state3 = await voting.getCandidate(electionId1, candidateId1)
                    assert.equal(state3[7].toString(), bigExp(29, decimals).toString(), 'vote should have been counted')
                    const voterState3 = await voting.getVoterState(electionId1, candidateId1, holder29)
                    assert.equal(voterState3, VOTER_STATE.YEA, 'holder29 should have yea voter status')
                })

                it('holder chose candidate', async () => {
                    const state1 = await voting.getCandidate(electionId1, candidateId1)
                    assert.equal(state1[7].toString(), 0, 'vote should not have been counted')

                    const chosenCandidate = await voting.getVoterChoice(electionId1, holder29)
                    assert.equal(chosenCandidate, 0, 'voter should not have made a choice')

                    await voting.vote(candidateId1, true, true, { from: holder29 })
                    const state2 = await voting.getCandidate(electionId1, candidateId1)
                    assert.equal(state2[7].toString(), bigExp(29, decimals).toString(), 'vote should have been counted')

                    const chosenCandidateChange2 = await voting.getVoterChoice(electionId1, holder29)
                    assert.equal(chosenCandidateChange2.toString(), candidateId1.toString(), 'voter should have chossen candidate1')
                })

                 it('throws when vote is unchanged', async () => {
                    await voting.vote(candidateId1, true, true, { from: holder29 })

                    try{
                        await voting.vote(candidateId1, true, true, { from: holder29 })
                    }
                    catch (error){
                        assert.isTrue(error.toString().includes("revert ERROR_VOTE_UNCHANGED"), "Unexpected throw recieved")
                        return
                    }
                    assert.fail('Expected throw not recieved')

                })

                it('holder changed candidate', async () => {
                    await voting.vote(candidateId1, true, true, { from: holder29 })
                    const state1 = await voting.getCandidate(electionId1, candidateId1)
                    assert.equal(state1[7].toString(), bigExp(29, decimals).toString(), 'vote should have been counted')

                    const chosenCandidateChange1 = await voting.getVoterChoice(electionId1, holder29)
                    assert.equal(chosenCandidateChange1.toString(), candidateId1.toString(), 'voter should have chossen candidate1')

                    await voting.vote(candidateId2, true, true, { from: holder29 })
                    const state2 = await voting.getCandidate(electionId1, candidateId1)
                    assert.equal(state2[7].toString(), 0, 'vote should not have been removed')

                    const state3 = await voting.getCandidate(electionId1, candidateId2)
                    assert.equal(state3[7].toString(), bigExp(29, decimals).toString(), 'vote should have been counted')

                    const chosenCandidateChange2 = await voting.getVoterChoice(electionId1, holder29)
                    assert.equal(chosenCandidateChange2.toString(), candidateId2.toString(), 'voter should have chossen candidate2')
                })

                it('holder can modify vote to another candidate', async () => {
                    await voting.vote(candidateId1, true, true, { from: holder29 })
                    const state1 = await voting.getCandidate(electionId1, candidateId1)
                    assert.equal(state1[7].toString(), bigExp(29, decimals).toString(), 'vote should have been counted')
                    const voterState1 = await voting.getVoterState(electionId1, candidateId1, holder29)
                    assert.equal(voterState1, VOTER_STATE.YEA, 'holder29 should have yea voter status')

                    await voting.vote(candidateId2, true, true, { from: holder29 })
                    const state2 = await voting.getCandidate(electionId1, candidateId1)
                    assert.equal(state2[7].toString(), 0, 'vote should have been removed')

                    const voterState2 = await voting.getVoterState(electionId1, candidateId1, holder29)
                    assert.equal(voterState2, VOTER_STATE.NAY, 'holder29 should have nay voter status')

                    const state3 = await voting.getCandidate(electionId1, candidateId2)
                    assert.equal(state3[7].toString(), bigExp(29, decimals).toString(), 'vote should have been counted')

                    const voterState3 = await voting.getVoterState(electionId1, candidateId2, holder29)
                    assert.equal(voterState3, VOTER_STATE.YEA, 'holder29 should have yea voter status')
                })

                it('token transfers to non holder dont affect voting', async () => {
                    await token.transfer(nonHolder, bigExp(29, decimals), { from: holder29 })

                    await voting.vote(candidateId1, true, true, { from: holder29 })
                    const state = await voting.getCandidate(electionId1, candidateId1)

                    assert.equal(state[7].toString(), bigExp(29, decimals).toString(), 'votes should have been counted')
                    assert.equal(await token.balanceOf(holder29), 0, 'balance should be 0 at current block')
                })

                it('token transfers to holder dont affect voting', async () => {
                    await token.transfer(holder20, bigExp(29, decimals), { from: holder29 })

                    await voting.vote(candidateId1, true, true, { from: holder29 })
                    const state1 = await voting.getCandidate(electionId1, candidateId1)
                    assert.equal(state1[7].toString(), bigExp(29, decimals).toString(), 'votes should have been counted')

                    await voting.vote(candidateId1, true, true, { from: holder20 })
                    const state2 = await voting.getCandidate(electionId1, candidateId1)
                    assert.equal(state2[7].toString(), bigExp(49, decimals).toString(), 'votes should have been counted')
                    const bal = await token.balanceOf(holder20)
                    assert.equal(await token.balanceOf(holder29), 0, 'balance should be 0 at current block')
                    assert.equal(bal.toString(), bigExp(49, decimals).toString(), 'balance should be 49 at current block')
                })

                it('throws when non-holder votes', async () => {
                    return assertRevert(async () => {
                        await voting.vote(candidateId1, true, true, { from: nonHolder })
                    })
                })

                it('vote can be executed automatically if decided', async () => {
                    await voting.vote(candidateId1, true, true, { from: holder51 }) // causes execution
                    assert.equal(await executionTarget.counter(), 4, 'should have executed result')
                })

                it('vote count is correct', async () => {
                    await voting.vote(candidateId1, true, true, { from: holder20 }) // causes execution
                    await voting.vote(candidateId1, true, true, { from: holder29 }) // causes execution
                    await voting.vote(candidateId2, true, true, { from: holder51 }) // causes execution

                    const [isOpen1, isExecuted1, description1, startDate1, snapshotBlock1,supportRequired1, minQuorum1, votes1] = await voting.getCandidate(electionId1, candidateId1)
                    assert.equal(description1, 'Good Choice', 'should have returned correct candidate')
                    assert.equal(votes1.toString(), bigExp(49, decimals).toString(), 'vote count for candidate 1 should be correct')

                    const [isOpen2, isExecuted2, description2, startDate2, snapshotBlock2,supportRequired2, minQuorum2, votes2] = await voting.getCandidate(electionId1, candidateId2)
                    assert.equal(description2, 'Better Choice', 'should have returned correct candidate')
                    assert.equal(votes2.toString(), bigExp(51, decimals).toString(), 'vote count for candidate 2 should be correct')
                })

                it('throws when voting after voting closes', async () => {
                    await timeTravel(votingTime + 1)
                    return assertRevert(async () => {
                        await voting.vote(candidateId1, true, true, { from: holder29 })
                    })
                })
                // Not Activated



                it('can execute if vote is approved with support and quorum', async () => {
                    await voting.vote(candidateId1, true, true, { from: holder29 })
                    await voting.vote(candidateId2, true, true, { from: holder20 })
                    const test = await timeTravel(votingTime + 1)
                    console.log(timeTravel)
                    await voting.executeElection(electionId1)
                    assert.equal(await executionTarget.counter(), 2, 'should have executed result')
                })

                // it('cannot execute vote if not enough quorum met', async () => {
                //     await voting.vote(candidateId1, true, true, { from: holder20 })
                //     await timeTravel(votingTime + 1)
                //     return assertRevert(async () => {
                //         await voting.executeVote(candidateId1)
                //     })
                // })

                // it('cannot execute vote if not support met', async () => {
                //     await voting.vote(candidateId1, false, true, { from: holder29 })
                //     await voting.vote(candidateId1, false, true, { from: holder20 })
                //     await timeTravel(votingTime + 1)
                //     return assertRevert(async () => {
                //         await voting.executeVote(candidateId1)
                //     })
                // })

                // it('vote can be not executed automatically if decided', async () => {
                //     await voting.vote(candidateId1, true, false, { from: holder51 }) // doesnt cause execution
                //     await voting.executeElection(electionId)
                //     assert.equal(await executionTarget.counter(), 4, 'should have executed result')
                // })

                // it('cannot re-execute vote', async () => {
                //     await voting.vote(candidateId1, true, true, { from: holder51 }) // causes execution
                //     return assertRevert(async () => {
                //         await voting.executeElection(electionId)
                //     })
                // })

                // it('cannot vote on executed vote', async () => {
                //     await voting.vote(candidateId1, true, true, { from: holder51 }) // causes execution
                //     return assertRevert(async () => {
                //         await voting.vote(candidateId1, true, true, { from: holder20 })
                //     })
                // })

                // it('get results', async () => {
                //     await voting.vote(candidateId1, true, true, { from: holder51 }) // causes execution
                //     const results = voting.getResults(electionId)
                //     console.log(results)
                // })


            })
        })
    }


})
