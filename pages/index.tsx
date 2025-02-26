import { useState, useEffect } from "react";
import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import Head from "next/head";
import toast from "react-hot-toast";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, parseEther } from 'viem';
import { base } from 'viem/chains';
import { http } from 'viem';
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator"
import { getEntryPoint, KERNEL_V3_1 } from "@zerodev/sdk/constants";
import { createKernelAccount, createKernelAccountClient, createZeroDevPaymasterClient } from "@zerodev/sdk";
import { generatePrivateKey } from "viem/accounts";
import { serializePermissionAccount, toPermissionValidator } from "@zerodev/permissions";
import { toECDSASigner } from "@zerodev/permissions/signers";
import { toSudoPolicy } from "@zerodev/permissions/policies";

// Configuration for BASE network
const BASE_CONFIG = {
  projectId: "e9ce930f-06e5-4f51-b60e-d404163db7b7",
  chain: base,
  chainId: 8453,
  bundlerRpc: "https://rpc.zerodev.app/api/v2/bundler/e9ce930f-06e5-4f51-b60e-d404163db7b7",
  paymasterRpc: "https://rpc.zerodev.app/api/v2/paymaster/e9ce930f-06e5-4f51-b60e-d404163db7b7",
  publicRpc: "https://mainnet.base.org"
};

// Storage keys
const STORAGE_KEYS = {
  walletInfo: "zeroDevWalletInfo",
  sessionInfo: "zeroDevSessionInfo"
};

// Simplified transfer function
async function transfer(
  kernelClient,
  toAddress,
  amount
) {
  try {
    // Ensure toAddress is a valid hex string
    if (!toAddress.startsWith('0x')) {
      throw new Error('Invalid address format');
    }

    console.log("Transfer parameters:", {
      to: toAddress,
      value: amount.toString(), // Convert BigInt to string for logging
    });

    // Use the simpler sendTransaction API
    const userOpHash = await kernelClient.sendTransaction({
      to: toAddress,
      value: amount,
      data: "0x",
    });
    
    console.log("Native token transfer userOpHash:", userOpHash);
    return userOpHash;
  } catch (error) {
    console.error("Error executing transfer:", error);
    throw error;
  }
}

// Button Component for consistent styling
function Button({ onClick, disabled, color, children }) {
  const colorClasses = {
    blue: "bg-blue-600 hover:bg-blue-700 focus:ring-blue-300 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800",
    purple: "bg-purple-600 hover:bg-purple-700 focus:ring-purple-300 dark:bg-purple-600 dark:hover:bg-purple-700 dark:focus:ring-purple-800",
    green: "bg-green-600 hover:bg-green-700 focus:ring-green-300 dark:bg-green-600 dark:hover:bg-green-700 dark:focus:ring-green-800",
    red: "bg-red-600 hover:bg-red-700 focus:ring-red-300 dark:bg-red-600 dark:hover:bg-red-700 dark:focus:ring-red-800",
    gray: "bg-gray-600 hover:bg-gray-700 focus:ring-gray-300 dark:bg-gray-600 dark:hover:bg-gray-700 dark:focus:ring-gray-800",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`text-white ${colorClasses[color]} focus:ring-4 font-medium rounded-lg text-sm px-5 py-2.5 w-full min-w-[200px] h-12 disabled:opacity-70 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}

// Info Card Component for consistent styling
function InfoCard({ title, children, color = "gray" }) {
  const colorClasses = {
    gray: "bg-gray-50",
    indigo: "bg-indigo-50",
    green: "bg-green-50",
  };

  return (
    <div className={`p-4 border rounded-lg ${colorClasses[color]} w-full break-words mb-4`}>
      <h2 className="text-xl font-semibold mb-3">{title}</h2>
      {children}
    </div>
  );
}

// Main Application Component
function MainApp() {
  const { authenticated, user, logout, login } = usePrivy();
  const { wallets } = useWallets();
  
  // State for storing wallet and session key info
  const [walletInfo, setWalletInfo] = useState(null);
  const [sessionKeyInfo, setSessionKeyInfo] = useState(null);
  const [kernelClient, setKernelClient] = useState(null);
  const [sessionClient, setSessionClient] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [transferHash, setTransferHash] = useState(null);
  const [transferLoading, setTransferLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Target address for sending funds
  const TARGET_ADDRESS = "0x8D33614Cbc97B59F8408aD67E520549F57F80055";
  // Amount in USD converted to ETH (very approximate for demo)
  const AMOUNT_ETH = parseEther("0.000005"); // Approximate 0.01 USD worth of ETH on BASE

  // Function to load the existing wallet and session key from storage
  useEffect(() => {
    async function loadExistingWallet() {
      if (!authenticated || !wallets.length || isInitialized) return;
      
      try {
        setIsLoading(true);
        
        // Try to load wallet info from localStorage
        const savedWalletInfo = localStorage.getItem(STORAGE_KEYS.walletInfo);
        const savedSessionInfo = localStorage.getItem(STORAGE_KEYS.sessionInfo);
        
        if (savedWalletInfo && savedSessionInfo) {
          const walletData = JSON.parse(savedWalletInfo);
          const sessionData = JSON.parse(savedSessionInfo);
          
          console.log("Found saved wallet data:", walletData);
          console.log("Found saved session data:", sessionData);
          
          // Initialize the wallet and session client using the saved data
          await initializeFromSavedData(walletData, sessionData);
        }
      } catch (error) {
        console.error("Error loading saved wallet:", error);
        toast.error("Failed to load saved wallet");
      } finally {
        setIsLoading(false);
        setIsInitialized(true);
      }
    }
    
    loadExistingWallet();
  }, [authenticated, wallets]);

  // Initialize kernel clients from saved data
  async function initializeFromSavedData(walletData, sessionData) {
    try {
      // Get the entry point
      const entryPoint = getEntryPoint("0.7");
      
      // Create the public client
      const publicClient = createPublicClient({
        chain: base,
        transport: http(BASE_CONFIG.publicRpc),
      });
      
      // Recreate the wallet signer
      const walletSigner = privateKeyToAccount(walletData.privateKey);
      
      // Recreate the ECDSA validator
      const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
        signer: walletSigner,
        entryPoint: entryPoint,
        kernelVersion: KERNEL_V3_1,
      });
      
      // Recreate the wallet account
      const walletAccount = await createKernelAccount(publicClient, {
        kernelVersion: KERNEL_V3_1,
        plugins: {
          sudo: ecdsaValidator,
        },
        entryPoint: entryPoint,
        index: BigInt(walletData.index),
      });
      
      // Create the kernel client
      const myKernelClient = createKernelAccountClient({
        account: walletAccount,
        chain: base,
        entryPoint: entryPoint,
        bundlerTransport: http(BASE_CONFIG.bundlerRpc),
        middleware: {
          sponsorUserOperation: async ({ userOperation }) => {
            const zerodevPaymaster = createZeroDevPaymasterClient({
              chain: base,
              entryPoint: entryPoint,
              transport: http(BASE_CONFIG.paymasterRpc),
            });
            return zerodevPaymaster.sponsorUserOperation({
              userOperation,
              entryPoint: entryPoint,
            });
          },
        },
      });
      
      setKernelClient(myKernelClient);
      setWalletInfo(walletData);
      
      // Now recreate the session key client
      const sessionSigner = privateKeyToAccount(sessionData.privateKey);
      const sessionKeyValidator = await toECDSASigner({ signer: sessionSigner });
      
      // Create sudo policy for full permissions
      const sudoPolicy = toSudoPolicy({});
      
      const permissionPlugin = await toPermissionValidator(publicClient, {
        entryPoint: entryPoint,
        signer: sessionKeyValidator,
        policies: [sudoPolicy], // Use sudo policy instead of empty array
        kernelVersion: KERNEL_V3_1,
      });
      
      const sessionKeyAccount = await createKernelAccount(publicClient, {
        entryPoint: entryPoint,
        plugins: { 
          sudo: ecdsaValidator, 
          regular: permissionPlugin 
        },
        kernelVersion: KERNEL_V3_1,
        index: BigInt(walletData.index),
      });
      
      const mySessionClient = createKernelAccountClient({
        account: sessionKeyAccount,
        chain: base,
        entryPoint: entryPoint,
        bundlerTransport: http(BASE_CONFIG.bundlerRpc),
        middleware: {
          sponsorUserOperation: async ({ userOperation }) => {
            const zerodevPaymaster = createZeroDevPaymasterClient({
              chain: base,
              entryPoint: entryPoint,
              transport: http(BASE_CONFIG.paymasterRpc),
            });
            return zerodevPaymaster.sponsorUserOperation({
              userOperation,
              entryPoint: entryPoint,
            });
          },
        },
      });
      
      setSessionClient(mySessionClient);
      setSessionKeyInfo(sessionData);
      
      toast.success("Loaded existing wallet and session key");
    } catch (error) {
      console.error("Error initializing from saved data:", error);
      toast.error("Failed to initialize the saved wallet");
      // Clear the stored data if we can't initialize from it
      localStorage.removeItem(STORAGE_KEYS.walletInfo);
      localStorage.removeItem(STORAGE_KEYS.sessionInfo);
    }
  }

  // Combined function to create smart wallet and session key in one step
  async function createWalletAndSessionKey() {
    setIsLoading(true);
    
    try {
      // Get Privy wallet
      const embeddedWallet = wallets.find(
        (wallet) => wallet.walletClientType === "privy"
      );

      if (!embeddedWallet) {
        toast.error("No Privy embedded wallet found");
        return null;
      }
      
      console.log('Found embedded wallet');

      // Create public client using BASE network
      const publicClient = createPublicClient({
        chain: base,
        transport: http(BASE_CONFIG.publicRpc),
      });

      // Get the entry point address for version 0.7
      const entryPoint = getEntryPoint("0.7");

      // ======= STEP 1: CREATE SMART WALLET =======
      
      // Generate a private key for the smart wallet
      const walletPrivateKey = generatePrivateKey();
      console.log("Smart wallet private key generated:", walletPrivateKey);
      
      const smartAccountSigner = privateKeyToAccount(walletPrivateKey);
      console.log('Smart account signer:', smartAccountSigner);

      // Create ECDSA validator for the smart wallet
      const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
        signer: smartAccountSigner,
        entryPoint: entryPoint,
        kernelVersion: KERNEL_V3_1,
      });

      // Set a specific index for the kernel account
      const accountIndex = BigInt(1);

      // Create kernel account
      const account = await createKernelAccount(publicClient, {
        kernelVersion: KERNEL_V3_1,
        plugins: {
          sudo: ecdsaValidator,
        },
        entryPoint: entryPoint,
        index: accountIndex,
      });
      
      // Create kernel account client with BASE network and paymaster
      const myKernelClient = createKernelAccountClient({
        account,
        chain: base,
        entryPoint: entryPoint,
        bundlerTransport: http(BASE_CONFIG.bundlerRpc),
        middleware: {
          sponsorUserOperation: async ({ userOperation }) => {
            const zerodevPaymaster = createZeroDevPaymasterClient({
              chain: base,
              entryPoint: entryPoint,
              transport: http(BASE_CONFIG.paymasterRpc),
            });
            return zerodevPaymaster.sponsorUserOperation({
              userOperation,
              entryPoint: entryPoint,
            });
          },
        },
      });
      
      console.log('Smart Wallet Account:', myKernelClient);
      setKernelClient(myKernelClient);
      
      const smartWalletAddress = myKernelClient.account.address;
      console.log('Smart Wallet Address:', smartWalletAddress);
      
      // Save smart wallet info to state
      const smartWalletInfo = {
        address: smartWalletAddress,
        privateKey: walletPrivateKey,
        index: accountIndex.toString(),
        network: "BASE"
      };
      
      setWalletInfo(smartWalletInfo);
      
      // Save to localStorage for persistence
      localStorage.setItem(STORAGE_KEYS.walletInfo, JSON.stringify(smartWalletInfo));
      
      toast.success("Smart Wallet created on BASE network!");

      // ======= STEP 2: CREATE SESSION KEY =======
      
      // Generate a new session key
      const sessionKeyPrivateKey = generatePrivateKey();
      const sessionKeySigner = privateKeyToAccount(sessionKeyPrivateKey);
      console.log("Session key address:", sessionKeySigner.address);

      // Create the session key validator
      const sessionKeyValidator = await toECDSASigner({ signer: sessionKeySigner });
      
      // Create sudo policy for full permissions
      const sudoPolicy = toSudoPolicy({});
      
      // Create permission plugin for the session key
      const permissionPlugin = await toPermissionValidator(publicClient, {
        entryPoint: entryPoint,
        signer: sessionKeyValidator,
        policies: [sudoPolicy], // Use sudo policy instead of empty array
        kernelVersion: KERNEL_V3_1,
      });

      // Create the session key account with the SAME INDEX as the smart wallet
      const sessionKeyAccount = await createKernelAccount(publicClient, {
        entryPoint: entryPoint,
        plugins: { 
          sudo: ecdsaValidator,     // Main key has full access
          regular: permissionPlugin // Session key has limited access
        },
        kernelVersion: KERNEL_V3_1,
        index: accountIndex, // Using the same index to link to the same wallet
      });

      console.log('Session key account created:', sessionKeyAccount);
      
      // Create a kernel client for the session key
      const mySessionClient = createKernelAccountClient({
        account: sessionKeyAccount,
        chain: base,
        entryPoint: entryPoint,
        bundlerTransport: http(BASE_CONFIG.bundlerRpc),
        middleware: {
          sponsorUserOperation: async ({ userOperation }) => {
            const zerodevPaymaster = createZeroDevPaymasterClient({
              chain: base,
              entryPoint: entryPoint,
              transport: http(BASE_CONFIG.paymasterRpc),
            });
            return zerodevPaymaster.sponsorUserOperation({
              userOperation,
              entryPoint: entryPoint,
            });
          },
        },
      });
      
      setSessionClient(mySessionClient);
      
      // Verify the addresses match (with proper null checking)
      if (sessionKeyAccount.address && smartWalletAddress) {
        if (sessionKeyAccount.address.toLowerCase() !== smartWalletAddress.toLowerCase()) {
          console.warn("Warning: Session key account address doesn't match smart wallet address!");
          console.log("Session key account address:", sessionKeyAccount.address);
          console.log("Smart wallet address:", smartWalletAddress);
        } else {
          console.log("Success: Session key is properly linked to the smart wallet!");
        }
      }
      
      // Create a serialized account
      const serialized = serializePermissionAccount(sessionKeyAccount);
      
      // Save session key info to state
      const sessionInfo = {
        address: sessionKeySigner.address,
        privateKey: sessionKeyPrivateKey,
        accountAddress: sessionKeyAccount.address,
        network: "BASE"
      };
      
      setSessionKeyInfo(sessionInfo);
      
      // Save to localStorage for persistence
      localStorage.setItem(STORAGE_KEYS.sessionInfo, JSON.stringify(sessionInfo));
      
      toast.success("Session Key created and linked to smart wallet on BASE!");
      
      return {
        smartWallet: smartWalletInfo,
        sessionKey: sessionInfo
      };
    } catch (error) {
      toast.error("Error creating wallet and session key");
      console.error("Error:", error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }

  // Function to reset wallet and create a new one
  function resetWallet() {
    localStorage.removeItem(STORAGE_KEYS.walletInfo);
    localStorage.removeItem(STORAGE_KEYS.sessionInfo);
    setWalletInfo(null);
    setSessionKeyInfo(null);
    setKernelClient(null);
    setSessionClient(null);
    setTransferHash(null);
    toast.success("Wallet data cleared. You can now create a new wallet.");
  }

  // Function to send a small amount of ETH
  async function sendDonation() {
    if (!sessionClient) {
      toast.error("No session client available. Please create a wallet first.");
      return;
    }

    setTransferLoading(true);
    try {
      const txHash = await transfer(
        sessionClient,
        TARGET_ADDRESS,
        AMOUNT_ETH
      );
      
      setTransferHash(txHash);
      toast.success("Successfully sent 0.01 USD worth of ETH!");
      return txHash;
    } catch (error) {
      toast.error("Error sending funds");
      console.error("Error sending funds:", error);
    } finally {
      setTransferLoading(false);
    }
  }

  // Handle logout
  const handleLogout = async () => {
    try {
      await logout();
      // Clear wallet data on logout for security
      resetWallet(); 
      toast.success("Logged out successfully");
    } catch (error) {
      console.error("Error logging out:", error);
      toast.error("Error logging out");
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="flex flex-col items-center justify-center gap-6 w-full max-w-2xl">
        <h1 className="text-4xl font-bold mb-4">Privy Login Demo</h1>
        
        {/* Login/Logout Section */}
        <div className="w-full flex gap-4 justify-center">
          {!authenticated ? (
            <Button 
              onClick={login}
              color="blue"
            >
              Login
            </Button>
          ) : (
            <Button 
              onClick={handleLogout}
              color="gray"
            >
              Logout
            </Button>
          )}
        </div>
        
        {authenticated && (
          <>
            {/* Wallet Info Section */}
            <InfoCard title="Wallet Information">
              <p>
                Privy Wallet Address: {wallets?.[0]?.address || "No wallet found"}
              </p>
            </InfoCard>
            
            {/* Action Buttons */}
            <div className="w-full flex flex-wrap gap-4 justify-center">
              <Button 
                onClick={createWalletAndSessionKey}
                disabled={isLoading || walletInfo !== null}
                color="purple"
              >
                {isLoading ? "Creating..." : "Create Wallet & Session Key"}
              </Button>
              
              {walletInfo && (
                <Button 
                  onClick={resetWallet}
                  color="red"
                >
                  Reset Wallet
                </Button>
              )}
              
              {sessionClient && (
                <Button 
                  onClick={sendDonation}
                  disabled={transferLoading || !sessionClient}
                  color="green"
                >
                  {transferLoading ? "Sending..." : "Send 0.01 USD"}
                </Button>
              )}
            </div>
            
            {/* Wallet Details Section */}
            <div className="w-full mt-2">
              {walletInfo && (
                <InfoCard title="Smart Wallet (BASE Network)">
                  <div className="grid grid-cols-1 gap-2">
                    <div>
                      <span className="font-semibold">Address:</span> {walletInfo.address}
                    </div>
                    <div>
                      <span className="font-semibold">Index:</span> {walletInfo.index}
                    </div>
                    <div>
                      <span className="font-semibold">Network:</span> {walletInfo.network}
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 mt-2">Private key (demo only):</p>
                      <p className="font-mono text-xs overflow-x-auto bg-gray-100 p-2 rounded">{walletInfo.privateKey}</p>
                    </div>
                  </div>
                </InfoCard>
              )}
              
              {sessionKeyInfo && (
                <InfoCard title="Session Key (BASE Network)">
                  <div className="grid grid-cols-1 gap-2">
                    <div>
                      <span className="font-semibold">Session Key Address:</span> {sessionKeyInfo.address}
                    </div>
                    <div>
                      <span className="font-semibold">Linked to Wallet:</span> {sessionKeyInfo.accountAddress}
                    </div>
                    <div>
                      <span className="font-semibold">Network:</span> {sessionKeyInfo.network}
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 mt-2">Session private key (demo only):</p>
                      <p className="font-mono text-xs overflow-x-auto bg-gray-100 p-2 rounded">{sessionKeyInfo.privateKey}</p>
                    </div>
                  </div>
                </InfoCard>
              )}
              
              {/* Transfer Information */}
              {sessionClient && (
                <InfoCard title="Transfer Funds" color="indigo">
                  <p className="mb-4">Send 0.01 USD worth of ETH to: 
                    <span className="font-mono text-sm ml-2 bg-indigo-100 p-1 rounded">{TARGET_ADDRESS}</span>
                  </p>
                  
                  {transferHash && (
                    <div className="mt-4 p-3 border rounded-lg bg-green-50">
                      <h3 className="text-lg font-semibold mb-2">Transaction Sent!</h3>
                      <p className="mb-2">User Operation Hash:</p>
                      <p className="font-mono text-xs bg-white p-2 rounded overflow-x-auto">{transferHash}</p>
                      <a 
                        href={`https://basescan.org/tx/${transferHash}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline mt-3 inline-block"
                      >
                        View on BaseScan
                      </a>
                    </div>
                  )}
                </InfoCard>
              )}
              
              {/* User Info */}
              <InfoCard title="Connected User">
                <div className="grid grid-cols-1 gap-2">
                  <div>
                    <span className="font-semibold">User ID:</span> {user?.id}
                  </div>
                  <div>
                    <span className="font-semibold">Email:</span> {user?.email?.address || "Not provided"}
                  </div>
                </div>
              </InfoCard>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Root Component with Provider
export default function Home() {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return <div>Loading...</div>;
  }

  return (
    <>
      <Head>
        <title>Privy Login Demo</title>
        <meta name="description" content="A proof of concept for Privy authentication" />
      </Head>
      
      <PrivyProvider appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID}>
        <MainApp />
      </PrivyProvider>
    </>
  );
}