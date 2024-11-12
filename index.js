import axios from 'axios';
import fs from 'fs';
import readline from 'readline';
import Web3 from 'web3';

function printBanner() {
  console.log('\x1b[34m', '██     ██ ██ ███    ██ ███████ ███    ██ ██ ██████  ');
  console.log('\x1b[34m', '██     ██ ██ ████   ██ ██      ████   ██ ██ ██   ██ ');
  console.log('\x1b[34m', '██  █  ██ ██ ██ ██  ██ ███████ ██ ██  ██ ██ ██████  ');
  console.log('\x1b[34m', '██ ███ ██ ██ ██  ██ ██      ██ ██  ██ ██ ██ ██      ');
  console.log('\x1b[34m', ' ███ ███  ██ ██   ████ ███████ ██   ████ ██ ██      ');
  console.log('\x1b[0m');
  console.log("Hanafuda Bot Auto Deposit");
  console.log("Join our Telegram channel: https://t.me/winsnip");
}

function consolewithTime(word) {
  const now = new Date().toISOString().split('.')[0].replace('T', ' ');
  console.log(`[${now}] ${word}`);
}

const RPC_URL = "https://mainnet.base.org";
const CONTRACT_ADDRESS = "0xC5bf05cD32a14BFfb705Fb37a9d218895187376c";
const CONFIG = './config.json';
const REQUEST_URL = 'https://hanafuda-backend-app-520478841386.us-central1.run.app/graphql';
const REFRESH_URL = 'https://securetoken.googleapis.com/v1/token?key=AIzaSyDipzN0VRfTPnMGhQ5PSzO27Cxm3DohJGY';
const FEE_THRESHOLD = 0.00000030;

const web3 = new Web3(new Web3.providers.HttpProvider(RPC_URL));

const ABI = [
  {
    "constant": false,
    "inputs": [],
    "name": "depositETH",
    "outputs": [],
    "payable": true,
    "stateMutability": "payable",
    "type": "function"
  }
];

const contract = new web3.eth.Contract(ABI, CONTRACT_ADDRESS);
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

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

async function refreshTokenHandler(tokenData) {
  consolewithTime('Mencoba merefresh token...')
  try {
    const response = await axios.post(REFRESH_URL, null, {
      params: {
        grant_type: 'refresh_token',
        refresh_token: tokenData.refreshToken,
      },
    });

    const updatedTokens = {
      ...tokenData,
      authToken: `Bearer ${response.data.access_token}`,  // Update auth token
      refreshToken: response.data.refresh_token,        // Update refresh token
    };

    const existingTokens = JSON.parse(fs.readFileSync(CONFIG, 'utf-8'));

    const index = existingTokens.findIndex(token => token.privateKey === tokenData.privateKey);
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

async function syncTransaction(txHash, tokenData) {
  const maxRetries = 3;
  const retryDelay = 5000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.post(
        REQUEST_URL,
        {
          query: `
            mutation SyncEthereumTx($chainId: Int!, $txHash: String!) {
              syncEthereumTx(chainId: $chainId, txHash: $txHash)
            }`,
          variables: {
            chainId: 8453,
            txHash: txHash
          },
          operationName: "SyncEthereumTx"
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': tokenData.authToken
          }
        }
      );

      if (response.data && response.data.data && response.data.data.syncEthereumTx) {
        consolewithTime(`Transaksi ${txHash} Sukses sync.`);
        break;
      } else {
        throw new Error(`Sync gagal.`);
      }
    } catch (error) {
      consolewithTime(`Mencoba ${attempt} - Gagal sync transaksi ${txHash}:`, error.message);

      if (attempt === 3) {
        consolewithTime('Mencoba refresh token...');
        const refreshedToken = await refreshTokenHandler(tokenData);
        if (refreshedToken) {
          tokenData.authToken = refreshedToken;
          consolewithTime('Token berhasil di refresh...');
          attempt--;
          continue;
        } else {
          consolewithTime('Token gagal di refresh...');
          break;
        }
      }

      consolewithTime(`Mencoba retry dalam ${retryDelay / 1000} detik...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
}

async function waitForLowerFee(gasLimit) {
  let gasPrice, txnFeeInEther;
  do {
    gasPrice = await web3.eth.getGasPrice();
    const txnFee = gasPrice * gasLimit;
    txnFeeInEther = web3.utils.fromWei(txnFee.toString(), 'ether');

    if (parseFloat(txnFeeInEther) > FEE_THRESHOLD) {
      consolewithTime(`Transaksi fee sekitar: ${txnFeeInEther} ETH, menunggu...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  } while (parseFloat(txnFeeInEther) > FEE_THRESHOLD);

  return gasPrice;
}

async function executeTransactions(tokenData, numTx, amountInEther) {
  const { privateKey } = tokenData;

  if (!/^(0x)?[0-9a-f]{64}$/i.test(privateKey)) {
    consolewithTime('Invalid format private key.');
    return;
  }

  try {
    const amountInWei = web3.utils.toWei(amountInEther, 'ether');
    const account = web3.eth.accounts.privateKeyToAccount('0x' + privateKey);
    web3.eth.accounts.wallet.add(account);
    const fromAddress = account.address;

    for (let i = 0; i < numTx; i++) {
      try {
        const currentNonce = await web3.eth.getTransactionCount(fromAddress, 'pending');
        const gasLimit = await contract.methods.depositETH().estimateGas({ from: fromAddress, value: amountInWei });
        const gasPrice = await waitForLowerFee(gasLimit);

        const tx = {
          from: fromAddress,
          to: CONTRACT_ADDRESS,
          value: amountInWei,
          gas: gasLimit,
          gasPrice: gasPrice,
          nonce: currentNonce,
          data: contract.methods.depositETH().encodeABI()
        };

        const signedTx = await web3.eth.accounts.signTransaction(tx, privateKey);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

        consolewithTime(`Transaksi ${i + 1} untuk wallet ${fromAddress} sukses dengan hash: ${receipt.transactionHash}`);
        await syncTransaction(receipt.transactionHash, tokenData);
      } catch (txError) {
        consolewithTime(`Transaksi failed ${i + 1} untuk wallet ${fromAddress}:`, txError.message);
        i--;
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    consolewithTime(`Transaksi untuk wallet ${fromAddress} selesai.`);
  } catch (error) {
    consolewithTime(`Failed execute transaksi: ${error.message}`);
  }
}

async function main() {
  const accounts = getAccounts();
  
  rl.question('Enter number of transactions: ', async (txCount) => {
    const numTx = parseInt(txCount);

    if (isNaN(numTx) || numTx <= 0) {
      consolewithTime('Invalid jumlah transaksi.');
      rl.close();
      return;
    }

    rl.question('Do you want to use the default amount of 0.0000000000001 ETH? (y/n): ', async (useDefault) => {
      let amountInEther = '0.0000000000001';

      if (useDefault.toLowerCase() !== 'y') {
        rl.question('Enter amount to deposit (in ETH): ', (amount) => {
          if (!isNaN(parseFloat(amount)) && parseFloat(amount) > 0) {
            amountInEther = amount;
          } else {
            consolewithTime('Invalid amount entered. Using the default amount.');
          }
          rl.close();
          for (const account of accounts) {
            executeTransactions(account, numTx, amountInEther);
          }
        });
      } else {
        rl.close();
        for (const account of accounts) {
          executeTransactions(account, numTx, amountInEther);
        }
      }
    });
  });
}


printBanner();
main();
