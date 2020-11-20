#!/usr/bin/env node

const fs = require('fs');
const SparkMD5 = require('spark-md5');
const chalk = require('chalk');
const prompts = require('prompts');
const path = require('path');
const FormData = require('form-data');
require('winston-daily-rotate-file');
const logger = require('../lib/log');
const ProgressBar = require('progress');
const { CHUNK_SIZE } = require('../lib/constants');
const { generateAuthorization, getRegistryInfo } = require('../lib/utils');
const { getExistChunks: _getExistChunks, uploadChunk: _uploadChunk, uploadSuccess: _uploadSuccess } = require('../lib/request');

const argv = require('../lib/argv');
const { requestUrl, version } = getRegistryInfo(argv.registry);

let Authorization = '';
let md5 = '';
let uploadId = '';
let fileSize = 0;

process.on('uncaughtException', error => {
    console.log(chalk.red('\n程序发生了一些异常，请稍后重试\n'));
    logger.error(error.stack);
})

const upload = async (filePath, parts = []) => {
    const totalChunk = Math.ceil(fileSize / CHUNK_SIZE);

    const bar = new ProgressBar(':bar [:current/:total] :percent', { total: totalChunk });
    const uploadChunk = async (currentChunk, currentChunkIndex, parts, isRetry) => {
        if (parts.some(({ partNumber, size }) => partNumber === currentChunkIndex && size === currentChunk.length)) {
            bar.tick();
            return Promise.resolve();
        }

        const form = new FormData();
        form.append('chunk', currentChunk, {
            filename: requestUrl.replace(/^http(s)?:\/\/.+?\/.+?\/.+?\//, '')
        });
        try {
            await _uploadChunk(requestUrl, {
                uploadId,
                version,
                partNumber: currentChunkIndex,
                size: currentChunk.length,
                form
            }, {
                headers: form.getHeaders(),
                Authorization
            });
            bar.tick();
        } catch (error) {
            logger.error(error.message);
            logger.error(error.stack);
            if (['ECONNREFUSED', 'ECONNRESET', 'ENOENT'].includes(error.code)) {
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
        for (let currentChunkIndex = 1; currentChunkIndex <= totalChunk; currentChunkIndex++) {
            const start = (currentChunkIndex - 1) * CHUNK_SIZE;
            const end = ((start + CHUNK_SIZE) >= fileSize) ? fileSize : start + CHUNK_SIZE - 1;
            const stream = fs.createReadStream(filePath, { start, end })
            let buf = [];
            await new Promise((resolve) => {
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
        }
    } catch (error) {
        logger.error(error.message);
        logger.error(error.stack);
        console.log(chalk(error.message));
        return;
    }

    try {
        const res = await _uploadSuccess(requestUrl, {
            version,
            uploadId,
            fileSize,
            fileTag: md5
        }, {
            Authorization
        });
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
        return;
    }
}

const getFileMD5 = async (filePath) => {
    const totalChunk = Math.ceil(fileSize / CHUNK_SIZE);
    const spark = new SparkMD5.ArrayBuffer();
    try {
        console.log(`\n开始计算 MD5\n`)
        logger.info('开始计算 MD5')

        const bar = new ProgressBar(':bar [:current/:total] :percent', { total: totalChunk });
        await new Promise(resolve => {
            stream = fs.createReadStream(filePath, { highWaterMark: CHUNK_SIZE })
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
        return;
    }
}

const beforeUpload = async (filePath) => {
    try {
        const stat = fs.lstatSync(filePath);
        if (stat.isDirectory()) {
            console.log(chalk.red(`\n${filePath}不合法，需指定一个文件\n`))
            return ;
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
        process.exitCode = 1;
        return;
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
            message: '请输入登陆密码：',
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
