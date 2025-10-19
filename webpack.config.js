const path = require('path');

module.exports = {
    entry: './background.js',
    output: {
        filename: 'background.bundle.js',
        path: path.resolve(__dirname, 'dist'),
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