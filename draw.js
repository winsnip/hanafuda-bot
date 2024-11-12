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

const REQUEST_URL = 'https://hanafuda-backend-app-520478841386.us-central1.run.app/graphql';
const REFRESH_URL = 'https://securetoken.googleapis.com/v1/token?key=AIzaSyDipzN0VRfTPnMGhQ5PSzO27Cxm3DohJGY';
const CONFIG = './config.json';

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
          gardenRewardActionCount
        }
      }
    }`
  };

const executeGardenRewardPayload = {
    operationName: 'executeGardenRewardAction',
    query: `mutation executeGardenRewardAction($limit: Int!) {
        executeGardenRewardAction(limit: $limit) {
            data {
                cardId
                group
            }
            isNew
        }
    }`,
    variables: {
        limit: 10,
      },
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

async function getInviterID(account) {
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
      consolewithTime(`${account.userName || 'User'} Memeriksa draw yang tersedia...`);
      const response = await axios.post(REQUEST_URL, getGardenPayload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': account.authToken,
        }
      });
      const gardenRewardActionCount = response.data?.data?.getGardenForCurrentUser?.gardenStatus?.gardenRewardActionCount;

      if (typeof gardenRewardActionCount === 'number') {
        consolewithTime(`${account.userName || 'User'} Draw tersedia: ${gardenRewardActionCount}`);
        return gardenRewardActionCount;
      } else {
        throw new Error('Error');
      }
    } catch (error) {
      consolewithTime(`${account.userName || 'User'} Token Expired!`);
  
      if (retryOnFailure) {
        const tokenRefreshed = await refreshTokenHandler(account);
        if (tokenRefreshed) {
          return getLoopCount(account, false);
        }
      }
      return 0;
    }
  }

  async function initiateDrawAction(account) {
    try {
      consolewithTime(`${account.userName || 'User'} Initiating Draw...`);

      const response = await axios.post(REQUEST_URL, executeGardenRewardPayload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': account.authToken,
        }
      });
      const result = response.data;
      if (result.data && result.data.executeGardenRewardAction) {
        consolewithTime(`${account.userName || 'User'} Sukses membuka kartu`);
        return result.data.executeGardenRewardAction;
      } else {
        if (result.errors && result.errors.length > 0) {
            const errorMessage = result.errors[0].message;
            consolewithTime(errorMessage);
            process.exit(1);
        }
        consolewithTime(`${account.userName || 'User'} Gagal membuka kartu`);
        return 0;
      }
    } catch (error) {
      consolewithTime(`${account.userName || 'User'} Gagal eksekusi untuk membuka kartu: ${error.message}`);  
      process.exit(1);
    }
  }

  async function processAccount(account) {
    // await getInviterID(account);
    await getCurrentUser(account);
  
    const loopCount = await getLoopCount(account);
  
    if (loopCount >= 10) {
        let totalResult = 0;
        const cardsToDrawPerAction = 10; 
        
        const totalActions = Math.floor(loopCount / cardsToDrawPerAction) + (loopCount % cardsToDrawPerAction ? 1 : 0);
        
        for (let i = 0; i < totalActions; i++) {
            const currentActionCount = Math.min(cardsToDrawPerAction, loopCount - (i * cardsToDrawPerAction));
            consolewithTime(`${account.userName || 'User'} Memulai Membuka ${currentActionCount} kartu pada aksi ${i + 1}/${totalActions}.`);
          
            const initiateResult = await initiateDrawAction(account, currentActionCount);
            totalResult += initiateResult; 
  
            if (initiateResult) {
                consolewithTime(`${account.userName || 'User'} Sukses membuka ${currentActionCount} kartu pada aksi ${i + 1}.`);
            } else {
                consolewithTime(`${account.userName || 'User'} Gagal membuka ${currentActionCount} kartu pada aksi ${i + 1}.`);
            }
        }
  
        consolewithTime(`${account.userName || 'User'} Semua draw telah selesai dilakukan. Total: ${totalResult}`);
    } else {
        consolewithTime(`${account.userName || 'User'} Tidak ada draw yang tersedia.`);
    }
}


async function executeGardenRewardActions() {
    while (true) {
      consolewithTime('Memulai draw untuk semua akun...');
      
      for (let account of accounts) {
        await processAccount(account);
      }
  
      consolewithTime('Semua akun telah terproses. Menunggu 1 jam untuk proses selanjutnya');
      await new Promise(resolve => setTimeout(resolve, 3600000));
    }
}

printBanner();
getAccounts();
executeGardenRewardActions();