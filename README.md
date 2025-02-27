# Setting Up a Next.js Project

## 1. Install Node.js  
Make sure you have **Node.js 18+** installed. Check your version with:  
```sh
node -v
```

## 2. Create a New Next.js App  
Run the following command to create a Next.js project:  
```sh
npx create-next-app@latest my-next-app
# or
yarn create next-app my-next-app
# or
pnpm create next-app my-next-app
```

## 3. Navigate to Your Project  
```sh
cd my-next-app
```

## 4. Start the Development Server  
```sh
npm run dev
# or
yarn dev
# or
pnpm dev
```
This starts the app at **http://localhost:3000**.

## 5. Build & Deploy  
To build the project for production, run:  
```sh
npm run build
```
To start the production server:  
```sh
npm run start
```

## 6. Optional: Add Tailwind CSS  
To use Tailwind, install it with:  
```sh
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```
Then, configure `tailwind.config.js` and add Tailwind to `globals.css`.

You're now ready to build with Next.js!

# Smart Wallet with Session Keys: Application Summary

## Overview
We've built a web application that demonstrates account abstraction using ZeroDev's SDK, combined with Privy for authentication. The application allows users to create a smart wallet on the BASE network, generate session keys to control that wallet, manage funds, and execute transactions.

## Core Components

### Authentication and Identity
- **Privy Integration**: Handles user authentication with email or social login
- **Wallet Management**: Creates and manages the user's smart wallet and session keys
- **Local Storage**: Stores wallet and session key information in the browser's `localStorage` for persistence

### Smart Wallet Implementation
- **Kernel Account**: Creates a smart contract wallet using ZeroDev's Kernel v3.1
- **Session Keys**: Implements session keys with full permissions using sudo policies
- **Transaction Execution**: Enables sending both native ETH and ERC-20 tokens (USDC)

### User Interface
- **Wallet Creation Flow**: Guides users through creating a smart wallet and session key
- **Balance Display**: Shows ETH and USDC balances for the wallet
- **Transaction Interface**: Allows sending USDC to a target address
- **Funding Interface**: Integrates with Privy's funding methods for adding funds to the wallet

## Key Functions

### `createWalletAndSessionKey()`
Creates both a smart wallet and session key in one step. It:
- Generates a private key for the smart wallet
- Creates an ECDSA validator using this key
- Creates a kernel account (smart wallet) with this validator
- Generates a separate private key for the session key
- Creates a permission validator with sudo policies
- Links the session key to the same smart wallet through the same index

### `initializeFromSavedData()`
Reconstructs the smart wallet and session key clients from saved private keys, allowing the wallet to be reused across sessions.

### `transfer()`
Handles both ETH and USDC transfers using different logic:
- For ETH: Simple transfer with `to`, `value`, and `data` parameters
- For USDC: Encodes an ERC-20 transfer function call

### `checkUSDCBalance()` and `checkBalances()`
Queries on-chain balances of ETH and USDC tokens for display and validation before transfers.

### `fundUserWallet()`
Integrates with Privy's funding modal to allow adding funds to the wallet.

## Current Limitations

### Storage Security
- **Local Storage**: Private keys are stored in browser `localStorage`, which is not secure for production use
- **No Encryption**: Keys are stored in plaintext without additional encryption
- **Session Persistence**: Session may be lost if `localStorage` is cleared

### Contract Interaction
- **Limited Contract Interaction**: We haven't implemented general smart contract interaction beyond simple transfers
- **No Custom Function Calls**: Can't yet call arbitrary functions on any contract
- **No Contract Deployment**: No functionality to deploy new contracts

### Transaction Handling
- **No Paymaster for ERC-20**: Transferring USDC requires ETH for gas, as we don't have a dedicated paymaster for ERC-20 transactions
- **No Batched Transactions**: Can't execute multiple transactions in a single user operation
- **Limited Error Handling**: Transaction failures could be handled more gracefully

### Session Key Management
- **Basic Policies**: We use sudo policies which grant full permissions rather than granular control
- **No Expiration**: Session keys don't expire and must be manually revoked by resetting the wallet
- **No Multiple Sessions**: There's no management of multiple session keys for different purposes

## How Key Storage Works
When a wallet is created, the application:
- Generates a private key and stores it in React state
- Saves this key to `localStorage` using the key `zeroDevWalletInfo`
- On page refresh or new session, checks `localStorage` for existing keys
- If found, reconstructs the wallet and session key using the saved private keys

This approach means the wallet persists even when the page is reloaded, but is tied to the specific browser/device.

In a production application, you'd want to use more secure key management techniques, like storing encrypted keys in a secured enclave or potentially using MPC (Multi-Party Computation) approaches.

## Future Enhancements
- Implement secure key storage (encryption, secure enclave, etc.)
- Add general contract interaction capabilities
- Implement paymasters for gasless ERC-20 transactions
- Create better session key policy management
- Add batched transaction support
- Improve error handling and recovery
- Implement proper key rotation and expiration
- Add support for multiple session keys with different permissions

## Key Storage Locations
The private keys are stored in your browser's `localStorage`. Specifically:
- The wallet's private key is saved under the key `zeroDevWalletInfo`. You can see this in the code:
    ```javascript
    localStorage.setItem(STORAGE_KEYS.walletInfo, JSON.stringify(smartWalletInfo));
    ```
- The session key's private key is saved under the key `zeroDevSessionInfo`:
    ```javascript
    localStorage.setItem(STORAGE_KEYS.sessionInfo, JSON.stringify(sessionInfo));
    ```

When you refresh the page or come back to the application later, it checks `localStorage` for these saved keys and reconstructs the wallet and session key clients using them. This is why your wallet persists across browser sessions.

You can actually see these stored values by:
1. Opening your browser's developer tools (`F12` or right-click → Inspect)
2. Going to the "Application" tab
3. Expanding "Local Storage" on the left
4. Clicking on your site's domain
5. Looking for the `zeroDevWalletInfo` and `zeroDevSessionInfo` entries

This is a simple approach for demo purposes, but for production applications, you'd want more secure key storage solutions as mentioned in the summary.
