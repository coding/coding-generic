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
        },
        concurrency: {
            alias: 'c',
            describe: '上传分块并行数',
            demandOption: true,
            default: 5,
        }
    })
    .alias('version', 'v')
    .help('h')
    .alias('h', 'help')
    .example('coding-generic --username=coding@coding.com --path=./test.txt --registry="https://codingcorp-generic.pkg.coding.net/project-name/generic-repo/chunks/test.txt?version=latest"')
    .argv;

module.exports = argv;