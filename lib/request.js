const axios = require('axios');
const util = require('util')
const logger = require('./log');


const http = axios.create({
    withCredentials: true,
})


// 响应拦截器
const responseSuccess = response => {
    return Promise.resolve(response)
}

const responseFailed = error => {
    console.log('eeee=>', error)
    const url = error && error.config && error.config.url
    console.error('网络请求错误', `(${url})`);
    logger.error(`网络请求错误 (${url})`);
    logger.error(JSON.stringify(util.inspect(error)));
    const { response } = error
    if (response) {
        console.error('网络请求错误', response.data);
        logger.error(response.data);
        logger.error(response);

    }
    return Promise.reject(error)
}
http.interceptors.response.use(responseSuccess, responseFailed)



/**
 * 获取已经上传完成的分片信息
 * @param {string} requestUrl
 * @param {string} version
 * @param {string} fileTag
 * @param {string} fileSize
 * @param {string} Authorization
 */
const getExistChunks = (requestUrl, {
    fileSize,
    version,
    fileTag
}, {
    Authorization
}) => {
    return http.post(`${requestUrl}?version=${version}&fileTag=${fileTag}&fileSize=${fileSize}&action=part-init`, {}, {
        headers: { Authorization }
    })
}

/**
 * 单个分片上传
 * @param {string} requestUrl 
 * @param {string} uploadId
 * @param {string} version
 * @param {number} partNumber 从 1 开始
 * @param {number} size 分片大小
 * @param {string} form 
 * @param {string} headers
 * @param {string} Authorization
 */
const uploadChunk = (requestUrl, {
    uploadId,
    version,
    partNumber,
    size,
    currentChunk,
}, {
    headers,
    Authorization
}) => {
    return http.post(`${requestUrl}?version=${version}&uploadId=${uploadId}&partNumber=${partNumber}&size=${size}&action=part-upload`, currentChunk, {
        maxContentLength: Infinity,
        maxBodyLength: Infinity, headers: { Authorization, ...headers }
    })
}

/**
 * 分片上传完成后通知合并所有 chunk
 * @param {string} requestUrl 
 * @param {string} version
 * @param {string} uploadId
 * @param {string} fileTag
 * @param {number} fileSize
 * @param {string} Authorization
 */
const mergeAllChunks = (requestUrl, {
    version,
    uploadId,
    fileTag,
    fileSize
}, {
    Authorization
}) => {
    return http.post(`${requestUrl}?version=${version}&uploadId=${uploadId}&fileTag=${fileTag}&size=${fileSize}&action=part-complete`, {}, {
        headers: { Authorization }
    })
}


const fetchDownloadList = async (registry, Authorization) => {
    return http.post(registry, {
    }, {
        headers: { Authorization }
    })

}

//http:/codingcorp-generic.pkg.coding-artifacts.test-codingcorp.woa.com/coding-xxx-567023e/generic-public/test/coding-coding
//http://codingcorp-generic.pkg.coding-artifacts.test-codingcorp.woa.com/coding-xxx-567023e/generic-public/test/coding-coding

const downloadFile = async (url, params, Authorization) => {
    return axios.get(url, {
        params,
        headers: {
            Authorization
        },
        responseType: 'stream'
    });

}


module.exports = {
    getExistChunks,
    uploadChunk,
    mergeAllChunks,
    fetchDownloadList,
    downloadFile
}


