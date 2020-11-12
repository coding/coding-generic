const argv = require('yargs')
    .usage('用法: coding-generic --username=<USERNAME> --path=<FILE.EXT> --registry=<REGISTRY>')
    .options({
        username: {
            alias: 'u',
            describe: '用户名',
            demandOption: true
        },
        path: {
            alias: 'p',
            describe: '需要上传的文件路径',
            demandOption: true
        },
        registry: {
            alias: 'r',
            describe: '仓库路径',
            demandOption: true
        }
    })
    .alias('version', 'v')
    .help('h')
    .alias('h', 'help')
    .example('coding-generic --username=coding@coding.com --path=./test.txt --registry="https://codingcorp-generic.pkg.coding.net/project/generic-repo/test.txt?version=latest"')
    .argv;

module.exports = argv;