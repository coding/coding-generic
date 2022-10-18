const argv = require('yargs')
    .usage('上传文件: coding-generic --username=<USERNAME>[:PASSWORD] --path=<FILE.EXT> --registry=<REGISTRY>')
    .usage('上传文件夹: coding-generic --username=<USERNAME>[:PASSWORD] --dir --path=<FOLDER> --registry=<REGISTRY>')
    .options({
        username: {
            alias: 'u',
            describe: '用户名（必填）和密码（可选），用冒号分隔',
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
        },
        dir: {
            alias: 'd',
            describe: '上传文件夹',
            boolean: true,
        }
    })
    .alias('version', 'v')
    .help('h')
    .alias('h', 'help')
    .example('上传文件: coding-generic --username=coding@coding.com:123456 --path=./test.txt --registry="https://codingcorp-generic.pkg.coding.net/project-name/generic-repo/chunks/test.txt?version=latest"')
    .example('上传文件夹: coding-generic --username=coding@coding.com:123456 --dir --path=./dirname --registry="https://codingcorp-generic.pkg.coding.net/project-name/generic-repo?version=latest"')
    .argv;

module.exports = argv;