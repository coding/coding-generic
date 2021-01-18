const chalk = require('chalk')
const logger = require('../lib/log');

const delay = (wait) => new Promise((r) => setTimeout(() => r(), wait))


/**
 * 
 * @param {fucntion} fn the function need to retry after rejected
 * @param {Number} retryCount number of retries
 * @param {Number} retryDelay delay time between each retries
 */
const withRetry = (fn, retryCount, retryDelay) => new Promise((resolve, reject) => 
  fn()
    .then(resolve)
    .catch((err) => {
      if (retryCount > 0) {
        logger.error(err);
        console.log(chalk.red('合并分片遇到了一个小问题，重试中...'))
        return delay(retryDelay)
          .then(withRetry.bind(null, fn, retryCount - 1, retryDelay))
          .then(resolve)
          .catch(reject)
      }
      return reject(err)
    })
)

module.exports = {
  withRetry
}