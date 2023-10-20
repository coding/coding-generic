const fs = require('fs');
const path = require('path');
const logger = require('./log');
const { generateAuthorization, getRegistryInfo } = require('./utils');
const { fetchDownloadList, downloadFile } = require('../lib/request');
const argv = require('./argv');

const { version, host, protocol, pathname } = getRegistryInfo(argv.registry);

let Authorization = '';

const onDownload = async () => {
    console.log('************************ 准备下载 ************************');
    logger.info('************************ 准备下载 ************************');
    Authorization = generateAuthorization(argv.username, argv.password);
    const res = await fetchDownloadList(argv.registry, Authorization)
    const { status, fileInfos = [] } = res.data
    if (status === 200) {
        await downloadFiles(fileInfos)
        console.log('************************ 下载完毕 ************************');
        logger.info('************************ 下载完毕 ************************');
    }
}

const downloadFiles = async (fileInfos = []) => {
    try {
        return await Promise.all(fileInfos.map(async info => {
            console.log(`正在下载 ${info.fileName} ...`);
            logger.info(`正在下载 ${info.fileName} ...`);
            const p = path.join(process.cwd(), info.fileName);
            const dir = p.split('/').slice(0, -1).join('/');
            if (dir && !fs.existsSync(dir)) {
                fs.mkdirSync(dir);
            }
            const writer = fs.createWriteStream(p);
            const url = `${protocol}//${path.join(host, path.join(pathname.split('/').slice(0, -2).join('/'), info.fileName))}`
            const res = await downloadFile(url, { version }, Authorization);
            await res.data.pipe(writer)
            await writer.end();
            await writer.close();
            console.log(`下载 ${info.fileName} 完成`);
            logger.info(`下载 ${info.fileName} 完成`);
        }));
    } catch (error) {
        console.log(error);
        logger.error(error);
        throw error;
    }

}

module.exports = {
    onDownload
}