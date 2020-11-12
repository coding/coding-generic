const { createLogger, format, transports } = require('winston');
const { combine, timestamp, printf } = format;

const userHome = process.env.HOME || process.env.USERPROFILE;

const formatLog = printf(({ level, message, timestamp }) => `${timestamp} ${level}: ${JSON.stringify(message)}`);
const transport = new (transports.DailyRotateFile)({
    filename: `${userHome}/.coding/log/coding-generic/%DATE%.log`,
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d'
});

const logger = createLogger({
    format: combine(
        timestamp(),
        formatLog
    ),
    'transports': [
        transport
    ]
});

module.exports = logger;