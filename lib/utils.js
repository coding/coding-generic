const url = require('url');
const querystring = require('querystring');
const path = require('path');

/**
 * 生成 Authorization
 * @param {string} username username
 * @param {string} password password
 * @returns Authorization
 */
const generateAuthorization = (username, password) => {
    const buf = Buffer.from(`${username}:${password}`);
    return `Basic ${buf.toString('base64')}`
}

/**
 * 获取 registry 上的信息
 * @param {string} registry registryUrl
 * @returns {{asdf}}
 */
const getRegistryInfo = (registry) => {
    const { protocol, host, query, pathname } = url.parse(registry);
    const { version } = querystring.parse(query)
    return {
        requestUrl: `${protocol}//${path.join(host, pathname)}`,
        version: !version || version === '<VERSION>' ? 'latest' : version,
        host, protocol, pathname
    }
}

module.exports = {
    generateAuthorization,
    getRegistryInfo
};