#!/usr/bin/env node

const fs = require('fs');
const SparkMD5 = require('spark-md5');
const chalk = require('chalk');
const prompts = require('prompts');
const path = require('path');
require('winston-daily-rotate-file');
const ProgressBar = require('progress');
const BlueBirdPromise = require("bluebird");

const logger = require('../lib/log');
const { DEFAULT_CHUNK_SIZE, MAX_CHUNK } = require('../lib/constants');
const { generateAuthorization, getRegistryInfo } = require('../lib/utils');

const { getExistChunks: _getExistChunks, uploadChunk: _uploadChunk, mergeAllChunks: _mergeAllChunks } = require('../lib/request');

const { withRetry } = require('../lib/withRetry');
const argv = require('../lib/argv');

const { requestUrl, version } = getRegistryInfo(argv.registry);

let Authorization = '';
let md5 = '';
let uploadId = '';
let fileSize = 0;

let chunkSize = DEFAULT_CHUNK_SIZE;
let totalChunk = 0;

process.on('uncaughtException', error => {
    console.log(chalk.red('\n程序发生了一些异常，请稍后重试\n'));
    logger.error(error.stack);
})

const upload = async (filePath, parts = []) => {
    const bar = new ProgressBar(':bar [:current/:total] :percent ', { total: totalChunk });
    const uploadChunk = async (currentChunk, currentChunkIndex, parts, isRetry) => {
        if (parts.some(({ partNumber, size }) => partNumber === currentChunkIndex && size === currentChunk.length)) {
            bar.tick();
            return Promise.resolve();
        }

        try {
            await _uploadChunk(requestUrl, {
                uploadId,
                version,
                partNumber: currentChunkIndex,
                size: currentChunk.length,
                currentChunk 
            }, {
                headers: {
                    'Content-Type': 'application/octet-stream'
                },
                Authorization
            });
            bar.tick();
        } catch (error) {
            logger.error(error.message);
            logger.error(error.stack);
            if (['ECONNREFUSED', 'ECONNRESET', 'ENOENT', 'EPROTO'].includes(error.code)) {
                // 没有重试过就重试一次
                if (!isRetry) {
                    logger.warn('retry')
                    logger.warn(error.code);
                    await uploadChunk(currentChunk, currentChunkIndex, parts, true);
                } else {
                    console.log(chalk.red('网络连接异常，请重新执行命令继续上传'));
                    process.exit(1);
                }
            } else {
                console.log(chalk.red((error.response && error.response.data) || error.message));
                process.exit(1);
            }
        }
    }

    console.log(`\n开始上传\n`)
    logger.info('开始上传')

    try {

        const chunkIndexs = new Array(totalChunk).fill("").map((_,index) => index+1)

        await BlueBirdPromise.map(chunkIndexs,(currentChunkIndex)=>{
            const start = (currentChunkIndex - 1) * chunkSize;
            const end = ((start + chunkSize) >= fileSize) ? fileSize : start + chunkSize - 1;
            const stream = fs.createReadStream(filePath, { start, end })
            let buf = [];
            return new Promise((resolve) => {
                stream.on('data', data => {
                    buf.push(data)
                })
                stream.on('error', error => {
                    reject('读取文件分片异常，请重新执行命令继续上传');
                })
                stream.on('end', async () => {
                    await uploadChunk(Buffer.concat(buf), currentChunkIndex, parts);
                    buf = null;
                    resolve();
                })
            }).catch(error => {
                throw Error(error)
            })
        }, { concurrency: argv.concurrency })

    } catch (error) {
        logger.error(error.message);
        logger.error(error.stack);
        console.log(chalk(error.message));
        process.exit(1);
    }



    

    const merge =  async () => {
        console.log(chalk.cyan('正在合并分片，请稍等...'))
        return await _mergeAllChunks(requestUrl, {
            version,
            uploadId,
            fileSize,
            fileTag: md5
        }, {
            Authorization
        });
    }
    

    try {
        const res = await withRetry(merge, 3, 500);
        if (res.code) {
            throw (res.message);
        }
    } catch (error) {
        logger.error(error.message);
        logger.error(error.stack);
        console.log(chalk.red((error.response && error.response.data) || error.message));
        return;
    }

    console.log(chalk.green(`\n上传完毕\n`))
    logger.info('************************ 上传完毕 ************************')
}

const getFileMD5Success = async (filePath) => {
    try {
        const res = await _getExistChunks(requestUrl, {
            fileSize,
            version,
            fileTag: md5
        }, {
            Authorization
        });
        if (res.code) {
            throw (res.message);
        }
        uploadId = res.data.uploadId;

        // 上传过一部分
        if (Array.isArray(res.data.parts)) {
            await upload(filePath, res.data.parts);
        } else {
            // 未上传过
            await upload(filePath);
        }
    } catch (error) {
        logger.error(error.message);
        logger.error(error.stack);
        console.log(chalk.red((error.response && error.response.data) || error.message));
        process.exit(1);
    }
}

const getFileMD5 = async (filePath) => {
    totalChunk = Math.ceil(fileSize / DEFAULT_CHUNK_SIZE);
    if (totalChunk > MAX_CHUNK) {
        chunkSize = Math.ceil(fileSize / MAX_CHUNK);
        totalChunk = Math.ceil(fileSize / chunkSize);
    }
    const spark = new SparkMD5.ArrayBuffer();
    try {
        console.log(`\n开始计算 MD5\n`)
        logger.info('开始计算 MD5')

        const bar = new ProgressBar(':bar [:current/:total] :percent ', { total: totalChunk });
        await new Promise(resolve => {
            stream = fs.createReadStream(filePath, { highWaterMark: chunkSize })
            stream.on('data', chunk => {
                bar.tick();
                spark.append(chunk)
            })
            stream.on('error', error => {
                reject('读取文件分片异常，请重新执行命令继续上传');
            })
            stream.on('end', async () => {
                md5 = spark.end();
                spark.destroy();
                console.log(`\n文件 MD5：${md5}\n`)
                await getFileMD5Success(filePath);
                resolve();
            })
        }).catch(error => {
            throw Error(error);
        })
    } catch (error) {
        console.log(chalk.red((error.response && error.response.data) || error.message));
        logger.error(error.message);
        logger.error(error.stack);
        process.exit(1);
    }
}

const beforeUpload = async (filePath) => {
    try {
        const stat = fs.lstatSync(filePath);
        if (stat.isDirectory()) {
            console.log(chalk.red(`\n${filePath}不合法，需指定一个文件\n`))
            process.exit(1);
        }
        fileSize = stat.size;
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log(chalk.red(`未找到 ${filePath}`));
        } else {
            logger.error(error.message);
            logger.error(error.stack);
            console.log(chalk.red((error.response && error.response.data) || error.message));
        }
        process.exit(1);
    }
    await getFileMD5(filePath);
}

const onUpload = (_username, _password) => {
    Authorization = generateAuthorization(_username, _password);

    logger.info('************************ 准备上传 ************************')

    if (path.isAbsolute(argv.path)) {
        beforeUpload(argv.path);
    } else {
        beforeUpload(path.join(process.cwd(), argv.path))
    }
}

const [username, password] = argv.username.split(':');

if (username && password) {
    onUpload(username, password);
} else {
    prompts([
        {
            type: 'password',
            name: 'password',
            message: '请输入登录密码：',
        }
    ], {
        onCancel: () => { }
    }
    ).then(async (answers) => {
        if (!answers.password) {
            return;
        }
        onUpload(argv.username, answers.password);
    })
}
