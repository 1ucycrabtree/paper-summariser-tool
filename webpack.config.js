const path = require('node:path');

module.exports = {
    entry: './background/background.js',
    output: {
        filename: 'background.bundle.js',
        path: path.resolve(__dirname, 'background/dist'),
    },
    mode: 'production',
    resolve: {
        fallback: {
            "stream": false,
            "util": false,
            "buffer": false,
            "string_decoder": false,
            "fs": false,
            "path": false
        }
    }
};