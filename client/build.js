const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Build config using API and Cognito User Pool info if we've deployed them
const config = {
  api: {
    invokeUrl: process.env.ApiUrl ? `${process.env.ApiUrl}/ride` : undefined,
  },
  cognito: {
    userPoolId: process.env.UserPoolId,
    userPoolClientId: process.env.UserPoolClientId,
    region: process.env.AwsRegion,
    disabled: !process.env.UserPoolClientId
  }
};

// Make the content retrievable from global `_config` variable
const configString = `window._config = ${JSON.stringify(config, null, 2)}`;

// Write to dist/js/config.js
const configPath = path.join('client', 'dist', 'js', 'config.js');
fs.writeFileSync(configPath, configString);
