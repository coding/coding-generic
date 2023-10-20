#!/usr/bin/env node

const fs = require('fs');
const SparkMD5 = require('spark-md5');
const chalk = require('chalk');
const prompts = require('prompts');
const path = require('path');
require('winston-daily-rotate-file');
const ProgressBar = require('progress');
const BlueBirdPromise = require("bluebird");
const glob = require('glob');

const logger = require('../lib/log');
const { DEFAULT_CHUNK_SIZE, MAX_CHUNK } = require('../lib/constants');
const { generateAuthorization, getRegistryInfo } = require('../lib/utils');

const { getExistChunks: _getExistChunks, uploadChunk: _uploadChunk, mergeAllChunks: _mergeAllChunks } = require('../lib/request');

const { withRetry } = require('../lib/withRetry');
const argv = require('../lib/argv');
const { onDownload } = require('../lib/download');

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

const upload = async (filePath, parts = [], requestUrl) => {
    const bar = new ProgressBar(':bar [:current/:total] :percent ', { total: totalChunk });
    const uploadChunk = async (currentChunk, currentChunkIndex, parts, isRetry) => {
        if (parts.some(({ partNumber, size }) => partNumber === currentChunkIndex && size === currentChunk.length)) {
            bar.tick();
            logger.info(`分片（${currentChunkIndex}）已经上传，跳过 (path: ${filePath}) , url: ${requestUrl})`);
            return Promise.resolve();
        }

        try {
            logger.info(`开始上传分片（${currentChunkIndex}） (path: ${filePath}) , url: ${requestUrl})`);
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
            logger.info(`分片（${currentChunkIndex}）上传完毕 (path: ${filePath}) , url: ${requestUrl})`);
            bar.tick();
        } catch (error) {
            console.error(`分片（${currentChunkIndex}）上传失败 (path: ${filePath}) , url: ${requestUrl})`);
            logger.error(`分片（${currentChunkIndex}）上传失败 (path: ${filePath}) , url: ${requestUrl})`);
            logger.error(error.message);
            logger.error(error.stack);
            if (['ECONNREFUSED', 'ECONNRESET', 'ENOENT', 'EPROTO'].includes(error.code)) {
                // 没有重试过就重试一次
                if (!isRetry) {
                    logger.warn('retry')
                    logger.warn(error.code);
                    logger.info(`重试分片（${currentChunkIndex}）上传 (path: ${filePath}) , url: ${requestUrl})`);
                    await uploadChunk(currentChunk, currentChunkIndex, parts, true);
                } else {
                    console.log(chalk.red('网络连接异常，请重新执行命令继续上传'));
                    logger.error(`分片（${currentChunkIndex}）上传时网络连接异常 (path: ${filePath}) , url: ${requestUrl})`);
                    await logger.close(() => process.exit(1));
                    throw error;
                }
            } else {
                console.log(chalk.red((error.response && error.response.data) || error.message));
                await logger.close(() => process.exit(1));
                throw error;
            }
        }
    }

    console.log(`\n开始上传 (${filePath})\n`);
    logger.info(`开始上传 (path: ${filePath}) , url: ${requestUrl})`);

    try {

        const chunkIndexs = new Array(totalChunk).fill("").map((_, index) => index + 1);

        logger.info(`分片总数：${totalChunk}，分片大小：${chunkSize} (path: ${filePath}) , url: ${requestUrl})`);

        await BlueBirdPromise.map(chunkIndexs, (currentChunkIndex) => {
            const start = (currentChunkIndex - 1) * chunkSize;
            const end = ((start + chunkSize) >= fileSize) ? fileSize : start + chunkSize - 1;
            const stream = fs.createReadStream(filePath, { start, end })
            let buf = [];
            return new Promise((resolve, reject) => {
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
                logger.error(`读取分片 ${currentChunkIndex} 数据失败 (path: ${filePath}) , url: ${requestUrl})`);
                throw Error(error)
            })
        }, { concurrency: argv.concurrency })

    } catch (error) {
        logger.error(error.message);
        logger.error(error.stack);
        console.log(chalk(error.message));
        await logger.close(() => process.exit(1));
        throw error;
    }





    const merge = async () => {
        console.log(chalk.cyan('正在合并分片，请稍等...'));
        logger.info(`正在合并分片 (path: ${filePath}) , url: ${requestUrl})`);
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
            logger.error(`合并分片失败 (path: ${filePath}) , url: ${requestUrl})`);
            throw (res.message);
        }
    } catch (error) {
        logger.error(error.message);
        logger.error(error.stack);
        console.log(chalk.red((error.response && error.response.data) || error.message));
        await logger.close(() => process.exit(1));
        throw error;
    }

    console.log(chalk.green(`\n上传完毕 (${filePath})\n`))
    logger.info(`************************ 上传完毕 (path: ${filePath}) , url: ${requestUrl}) ************************`)
}

const getFileMD5Success = async (filePath, requestUrl) => {
    let uploadedParts = []
    try {
        logger.info(`获取已上传信息 (path: ${filePath} , url: ${requestUrl})`);
        const res = await _getExistChunks(requestUrl, {
            fileSize,
            version,
            fileTag: md5
        }, {
            Authorization
        });
        if (res.code) {
            logger.info(`获取已上传信息错误(1): ${JSON.stringify(res)} (path: ${filePath} , url: ${requestUrl})`);
            throw (res.message);
        }
        uploadId = res.data.uploadId;
        logger.info(`上传的 UploadId: ${uploadId} (path: ${filePath} , url: ${requestUrl})`);
        // 上传过一部分
        if (Array.isArray(res.data.parts)) {
            uploadedParts = res.data.parts
        } else {
            // 未上传过
            uploadedParts = []
        }
    } catch (error) {
        logger.error(`获取已上传信息错误(2) (path: ${filePath} , url: ${requestUrl})`);
        logger.error(error.message);
        logger.error(error.stack);
        console.log(chalk.red((error.response && error.response.data) || error.message), `(path: ${filePath} , url: ${requestUrl}`);
        await logger.close(() => process.exit(1));
        throw error;
    }

    await upload(filePath, uploadedParts, requestUrl);
}

const getFileMD5 = async (filePath, requestUrl) => {
    totalChunk = Math.ceil(fileSize / DEFAULT_CHUNK_SIZE);
    if (totalChunk > MAX_CHUNK) {
        chunkSize = Math.ceil(fileSize / MAX_CHUNK);
        totalChunk = Math.ceil(fileSize / chunkSize);
    }
    const spark = new SparkMD5.ArrayBuffer();
    try {
        console.log(`\n开始计算 MD5 (${filePath})\n`);
        logger.info(`开始计算 MD5 (${filePath})`);

        const bar = new ProgressBar(':bar [:current/:total] :percent ', { total: totalChunk });
        await new Promise((resolve, reject) => {
            const stream = fs.createReadStream(filePath, { highWaterMark: chunkSize });
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
                await getFileMD5Success(filePath, requestUrl);
                resolve();
            })
        }).catch(error => {
            logger.error(`计算 MD5 失败(${filePath})`);
            throw Error(error);
        })
    } catch (error) {
        console.log(chalk.red((error.response && error.response.data) || error.message));
        logger.error(error.message);
        logger.error(error.stack);
        await logger.close(() => process.exit(1));
        throw error;
    }
}

const uploadFile = async (filePath, size, requestUrl) => {
    fileSize = size;
    logger.info(`************************ 开始上传 (${filePath}) ************************`);
    await getFileMD5(filePath, requestUrl);
    md5 = '';
    uploadId = '';
    fileSize = 0;
    chunkSize = DEFAULT_CHUNK_SIZE;
    totalChunk = 0;
}

const uploadDir = async (dir) => {
    let files = [];
    try {
        files = await new Promise((resolve, reject) => {
            glob("**/**", {
                cwd: dir,
                root: dir
            }, function (error, files = []) {
                if (error) {
                    reject(error);
                } else {
                    resolve(files)
                }
            })
        });
    } catch (error) {
        if (error) {
            console.log(chalk.red((error.response && error.response.data) || error.message));
            logger.error(error.message);
            logger.error(error.stack);
            await logger.close(() => process.exit(1));
            throw error;
        } else {
            return files;
        }
    }


    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.lstatSync(filePath);
        const isDirectory = stat.isDirectory();
        if (!isDirectory) {
            const url = new URL(`chunks/${dir.split(path.sep).pop()}/${file}`, requestUrl.endsWith('/') ? requestUrl : `${requestUrl}/`).toString();
            await uploadFile(filePath, stat.size, url);
            console.log('************************ **** ************************');
            logger.info('************************ **** ************************');
        }
    }
}

const beforeUpload = async (filePath) => {
    const isUploadDir = argv.dir;
    let fSize = 0;
    try {
        const stat = fs.lstatSync(filePath);
        const isDirectory = stat.isDirectory();
        if (isDirectory && !isUploadDir) {
            console.log(chalk.red(`\n${filePath}不合法，需指定一个文件\n`))
            await logger.close(() => process.exit(1));
        } else if (!isDirectory && isUploadDir) {
            console.log(chalk.red(`\n${filePath}不合法，需指定一个文件夹\n`))
            await logger.close(() => process.exit(1));
        }
        fSize = stat.size;
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log(chalk.red(`未找到 ${filePath}`));
        } else {
            logger.error(error.message);
            logger.error(error.stack);
            console.log(chalk.red((error.response && error.response.data) || error.message));
        }
        await logger.close(() => process.exit(1));
        throw error;
    }
    if (isUploadDir) {
        await uploadDir(filePath);
    } else {
        await uploadFile(filePath, fSize, requestUrl);
    }
}

const onUpload = async (_username, _password) => {
    Authorization = generateAuthorization(_username, _password);

    logger.info('************************ 准备上传 ************************')

    if (path.isAbsolute(argv.path)) {
        await beforeUpload(argv.path);
    } else {
        await beforeUpload(path.join(process.cwd(), argv.path))
    }

    await logger.close();
}

const [username, password] = argv.username.split(':');

if (username && password) {
    if (argv.pull) {
        onDownload()
    } else {
        onUpload(username, password);
    }
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
        } if (argv.pull) {
            onDownload()
        } else {
            onUpload(argv.username, answers.password);
        }
    })
}
