const axios = require('axios');

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
    return axios.post(`${requestUrl}?version=${version}&fileTag=${fileTag}&fileSize=${fileSize}&action=part-init`, {}, {
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
    return axios({
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        method: 'post',
        url: `${requestUrl}?version=${version}&uploadId=${uploadId}&partNumber=${partNumber}&size=${size}&action=part-upload`,
        data: currentChunk,
        headers: { Authorization, ...headers }
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
    return axios.post(`${requestUrl}?version=${version}&uploadId=${uploadId}&fileTag=${fileTag}&size=${fileSize}&action=part-complete`, {}, {
        headers: { Authorization }
    })
}

module.exports = {
    getExistChunks,
    uploadChunk,
    mergeAllChunks
}