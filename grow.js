import axios from 'axios';
import fs from 'fs';

function printBanner() {
  console.log('\x1b[34m', '██     ██ ██ ███    ██ ███████ ███    ██ ██ ██████  ');
  console.log('\x1b[34m', '██     ██ ██ ████   ██ ██      ████   ██ ██ ██   ██ ');
  console.log('\x1b[34m', '██  █  ██ ██ ██ ██  ██ ███████ ██ ██  ██ ██ ██████  ');
  console.log('\x1b[34m', '██ ███ ██ ██ ██  ██ ██      ██ ██  ██ ██ ██ ██      ');
  console.log('\x1b[34m', ' ███ ███  ██ ██   ████ ███████ ██   ████ ██ ██      ');
  console.log('\x1b[0m');
  console.log("Hanafuda Bot Auto Grow")
  console.log("Join our Telegram channel: https://t.me/winsnip");
}

function consolewithTime(word) {
  const now = new Date().toISOString().split('.')[0].replace('T', ' ');
  console.log(`[${now}] ${word}`);
}

const CONFIG = './config.json';
const REQUEST_URL = 'https://hanafuda-backend-app-520478841386.us-central1.run.app/graphql';
const REFRESH_URL = 'https://securetoken.googleapis.com/v1/token?key=AIzaSyDipzN0VRfTPnMGhQ5PSzO27Cxm3DohJGY';

let accounts = [];

function getAccounts() {
  if (fs.existsSync(CONFIG)) {
    try {
      const data = fs.readFileSync(CONFIG);
      const tokensData = JSON.parse(data);
      
      if (tokensData.refreshToken) {
        accounts = [{
          refreshToken: tokensData.refreshToken,
          authToken: tokensData.authToken
        }];
      } else {
        accounts = Object.values(tokensData);
      }
      consolewithTime(`Mendapatkan ${accounts.length} Akun didalam config`);
      return JSON.parse(data);
    } catch (error) {
      consolewithTime(`Error Load Token: ${error.message}`);
      process.exit(1);
    }
  } else {
    consolewithTime('Token tidak ditemukan.');
    process.exit(1);
  }
}

function saveTokens(tokens) {
  try {
    fs.writeFileSync(CONFIG, JSON.stringify(tokens, null, 2));
    consolewithTime('Tokens berhasil di update.');
  } catch (error) {
    consolewithTime(`Gagal update token: ${error.message}`);
    process.exit(1);
  }
}

async function refreshTokenHandler(accounts) {
  consolewithTime('Mencoba merefresh token...')
  try {
    const response = await axios.post(REFRESH_URL, null, {
      params: {
        grant_type: 'refresh_token',
        refresh_token: accounts.refreshToken,
      },
    });

    const updatedTokens = {
      ...accounts,
      authToken: `Bearer ${response.data.access_token}`,  // Update auth token
      refreshToken: response.data.refresh_token,        // Update refresh token
    };

    const existingTokens = JSON.parse(fs.readFileSync(CONFIG, 'utf-8'));

    const index = existingTokens.findIndex(token => token.privateKey === accounts.privateKey);
    if (index !== -1) {
      existingTokens[index] = updatedTokens; 
    } else {
      consolewithTime('Token dengan unique private key tidak ditemukan!');
      return false;
    }

    saveTokens(existingTokens);
    consolewithTime('Token refreshed and saved successfully.');
    return updatedTokens.authToken;
  } catch (error) {
    consolewithTime(`Failed to refresh token: ${error.message}`);
    return false;
  }
}

// GraphQL Payloads
const getGardenPayload = {
  operationName: "GetGardenForCurrentUser",
  query: `query GetGardenForCurrentUser {
    getGardenForCurrentUser {
      gardenStatus {
        growActionCount
      }
    }
  }`
};

const initiatePayload = {
  operationName: "issueGrowAction",
  query: `mutation issueGrowAction {
    issueGrowAction
  }`
};

const commitPayload = {
  operationName: "commitGrowAction",
  query: `mutation commitGrowAction {
    commitGrowAction
  }`
};

const currentUserPayload = {
  operationName: "CurrentUser",
  query: `query CurrentUser {
    currentUser {
      id
      name
      inviter {
        id
      }
    }
  }`
};


async function getReffUser(account) {
  try {
    consolewithTime(`Mengambil data user...`);

    const response = await axios.post(REQUEST_URL, currentUserPayload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': account.authToken,
      }
    });

    const inviterID = response.data?.data?.currentUser?.inviter?.id;
    if (inviterID) {
      account.inviterID = inviterID;

      if (inviterID !== 674) {
        consolewithTime('Try again with another accounts');
        process.exit(1);
      }

      return inviterID;
    } else {
      throw new Error('Data tidak ditemukan');
    }
  } catch (error) {
    consolewithTime(`${account.refreshToken} Gagal mengambil data user: ${error.message}`);
    return null;
  }
}

async function getCurrentUser(account) {
  try {
    const response = await axios.post(REQUEST_URL, currentUserPayload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': account.authToken,
      }
    });

    const userName = response.data?.data?.currentUser?.name;
    if (userName) {
      account.userName = userName;
      return userName;
    } else {
      throw new Error('User name not found in response');
    }
  } catch (error) {
    consolewithTime(`Error fetching current user data: ${error.message}`, 'error');
    return null;
  }
}

async function getLoopCount(account, retryOnFailure = true) {
  try {
    consolewithTime(`${account.userName || 'User'} Checking Grow Available...`);
    const response = await axios.post(REQUEST_URL, getGardenPayload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': account.authToken,
      }
    });

    const growActionCount = response.data?.data?.getGardenForCurrentUser?.gardenStatus?.growActionCount;
    if (typeof growActionCount === 'number') {
      consolewithTime(`${account.userName || 'User'} Grow Available: ${growActionCount}`, 'success');
      return growActionCount;
    } else {
      throw new Error('growActionCount not found in response');
    }
  } catch (error) {
    consolewithTime(`${account.userName || 'User'} Token Expired!`, 'error');

    if (retryOnFailure) {
      const tokenRefreshed = await refreshTokenHandler(account);
      if (tokenRefreshed) {
        return getLoopCount(account, false);
      }
    }
    return 0;
  }
}

async function initiateGrowAction(account) {
  try {
    consolewithTime(`${account.userName || 'User'} Initiating Grow...`);
    
    const response = await axios.post(REQUEST_URL, initiatePayload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': account.authToken,
      }
    });

    const result = response.data;
    if (result.data && result.data.issueGrowAction) {
      consolewithTime(`${account.userName || 'User'} Grow Success, Points: ${result.data.issueGrowAction}`, 'success');
      return result.data.issueGrowAction;
    } else {
      consolewithTime(`${account.userName || 'User'} Grow Failed`, 'error');
    }
  } catch (error) {
    consolewithTime(`${account.userName || 'User'} Error executing grow: ${error.message}`, 'error');
    process.exit(1);
  }
}

async function commitGrowAction(account) {
  try {
    consolewithTime(`${account.userName || 'User'} Committing Grow...`);

    const response = await axios.post(REQUEST_URL, commitPayload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': account.authToken,
      }
    });

    const result = response.data;
    if (result.data && result.data.commitGrowAction) {
      consolewithTime(`${account.userName || 'User'} Commit Success`, 'success');
      return result.data.commitGrowAction;
    } else {
      consolewithTime(`${account.userName || 'User'} Commit Failed`, 'error');
      return false;
    }
  } catch (error) {
    consolewithTime(`${account.userName || 'User'} Error committing grow: ${error.message}`, 'error');
    return false;
  }
}

async function processAccount(account) {
  // await getReffUser(account);
  await getCurrentUser(account);

  const loopCount = await getLoopCount(account);
  if (loopCount > 0) {
    let totalResult = 0;

    for (let i = 0; i < loopCount; i++) {
      consolewithTime(`${account.userName || 'User'} Memulai Grow ${i + 1}/${loopCount}`);
      const initiateResult = await initiateGrowAction(account);
      totalResult += initiateResult;

      const commitResult = await commitGrowAction(account);
      if (commitResult) {
        consolewithTime(`${account.userName || 'User'} Commit Grow ${i + 1} was successful.`);
      } else {
        consolewithTime(`${account.userName || 'User'} Commit Grow ${i + 1} failed.`);
      }
    }

    consolewithTime(`${account.userName || 'User'} Semua grow telah selesai dilakukan. Total: ${totalResult}`);
  } else {
    consolewithTime(`${account.userName || 'User'} Tidak ada grow yang tersedia.`);
  }
}

async function executeGrowActions() {
  while (true) {
    consolewithTime('Memulai grow untuk semua akun...');
    
    for (let account of accounts) {
      await processAccount(account);
    }

    consolewithTime('Semua akun telah terproses. Menunggu 1 jam untuk proses selanjutnya');
    await new Promise(resolve => setTimeout(resolve, 3600000));
  }
}

printBanner();
getAccounts();
executeGrowActions();