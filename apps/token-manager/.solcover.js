module.exports = {
    norpc: true,
    copyPackages: ['@aragon/os', '@aragon/apps-shared-minime'],
    skipFiles: [
        'test/TestImports.sol',
        'test/mocks/ExecutionTarget.sol',
    ]
}
