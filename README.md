# Hanafuda Bot

This bot automates depositing ETH to Hanafuda on the Base networks with support for multiple wallets.

## Features
- **Multi-Wallet Support:** Handle multiple wallets simultaneously.
- **Auto Deposit:** Execute auto deposit transactions with `npm run start`.
- **Auto Grow:** Automatically grow your deposits using `npm run grow`.
- **Auto Draw:** Automatically draw tokens with `npm run draw`.
- **Secure Key Handling:** Wallet addresses and sensitive data are kept secure.

## Requirements
- **Node.js** (version 12 or higher)
- **npm** (Node package manager)

## Getting Started

### Step 1: Clone the Repository
Open your terminal and run the following command:

```
git clone https://github.com/winsnip/hanafuda-bot
```

### Step 2: Navigate to the Project Directory
Change to the project folder:

```
cd hanafuda-bot
```


### Step 3: Install Dependencies
Run the following command to install necessary packages:

```
npm install
```

### Step 4: Create Configuration File
Create a file named `config.json` in the project directory and add your wallet details in the following format:

```
[
  {
    "refreshToken": "AMf-xxx",
    "authToken": "Bearer eyxxxx",
    "privateKey": "privateKey",
    "userName": "username hanafuda"
  },
  {
    "refreshToken": "AMf-xxx",
    "authToken": "Bearer eyxxxx",
    "privateKey": "privateKey",
    "userName": "username hanafuda"
  }
]
```

### Step 4.1: Get Refresh Token and Access Token
Paste command below on console when inspect element and search ***stsTokenManager***

```
const allSessionStorageData = Object.keys(sessionStorage).map(key => {
    const value = sessionStorage.getItem(key);
    return {
        key: key,
        value: JSON.parse(value)
    };
});

allSessionStorageData.forEach(item => {
    console.log(`Key: ${item.key}`);
    console.log('Value:', item.value);
    console.log('----------------------------------');
});
```

### Step 5: Run the Bot

- **To start auto depositing:**

```
npm run start
```

- **To activate auto grow:**

```
npm run grow
```

- **To execute auto draw:**

```
npm run draw
```

## DONASI

**kalo mau bayarin kopi https://trakteer.id/Winsnipsupport/tip**