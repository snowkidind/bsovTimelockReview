const { EVM } = require('evm')

module.exports = {
  getFunctionsForContract: async (address, provider) => {
    const code = await provider.getCode(address)
    const evm = new EVM(code)
    return evm.getFunctions()
  },

  getFunctionDefinitionsFromAbi: (abi, ethers) => {
    let fns = []
    if (abi) {
      const interface = new ethers.Interface(abi)
      interface.fragments.forEach((f) => {
        fns.push(f.format('full'))
      })
    }
    return fns
  }
}