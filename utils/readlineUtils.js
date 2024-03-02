const readline = require('node:readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

module.exports = {
  getAnswer: (message) => {
    return new Promise((resolve) => {
      rl.question(message + '\n > ', async (answer) => {
        if (answer === 'c') {
          console.log('Operation Cancelled')
          process.exit(1)
        }
        resolve(answer)
      })
    })
  }
}