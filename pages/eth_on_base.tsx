import { useState, useEffect } from "react";
import { PrivyProvider, usePrivy, useWallets, useFundWallet } from "@privy-io/react-auth";
import Head from "next/head";
import toast from "react-hot-toast";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient } from 'viem';
import { base } from 'viem/chains';
import { http } from 'viem';
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator"
import { getEntryPoint, KERNEL_V3_1 } from "@zerodev/sdk/constants";
import { createKernelAccount, createKernelAccountClient, createZeroDevPaymasterClient } from "@zerodev/sdk";
import { generatePrivateKey } from "viem/accounts";
import { toPermissionValidator } from "@zerodev/permissions";
import { toECDSASigner } from "@zerodev/permissions/signers";
import { toSudoPolicy } from "@zerodev/permissions/policies";
import axios from 'axios';

// Load configuration from environment variables
const BASE_CONFIG = {
  projectId: process.env.NEXT_PUBLIC_PRIVY_APP_ID || '',
  chain: base,
  chainId: 8453,
  bundlerRpc: process.env.NEXT_PUBLIC_ZERODEV_BUNDLER_URL || '',
  publicRpc: "https://mainnet.base.org",
  zerodev_paymaster_url: process.env.NEXT_PUBLIC_ZERODEV_PAYMASTER_URL || '',
};

// API endpoints for wallet storage
const API_ENDPOINTS = {
  getWalletData: (userId: string) => `/api/wallet-storage?userId=${userId}`,
  saveWalletData: '/api/wallet-storage',
  deleteWalletData: '/api/wallet-storage'
};

// Define types for wallet and session key info
interface WalletInfo {
  address: string;
  privateKey: string;
  index: string;
  network: string;
}

interface SessionKeyInfo {
  address: string;
  privateKey: string;
  accountAddress: string;
  network: string;
}

// Function to handle ETH transfers
async function transferETH(
  kernelClient: any,
  toAddress: string,
  amount: bigint
) {
  try {
    // Ensure toAddress is a valid hex string
    if (!toAddress.startsWith('0x')) {
      throw new Error('Invalid address format');
    }

    // Native token (ETH) transfer
    console.log("ETH Transfer parameters:", {
      to: toAddress,
      value: amount.toString(),
    });

    // Send the transaction
    const userOpHash = await kernelClient.sendTransaction({
      to: toAddress,
      value: amount,
      data: "0x",
    });
    
    console.log("ETH transfer userOpHash:", userOpHash);
    return userOpHash;
  } catch (error) {
    console.error("Error executing ETH transfer:", error);
    throw error;
  }
}

// Button Component for consistent styling
function Button({ onClick, disabled, color, children }: {
  onClick: () => void;
  disabled: boolean;
  color: 'blue' | 'purple' | 'green' | 'red' | 'gray';
  children: React.ReactNode;
}) {
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
function InfoCard({ title, children, color = "gray" }: {
  title: string;
  children: React.ReactNode;
  color?: 'gray' | 'indigo' | 'green';
}) {
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
  const { fundWallet } = useFundWallet();
  
  // State for storing wallet and session key info
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [sessionKeyInfo, setSessionKeyInfo] = useState<SessionKeyInfo | null>(null);
  const [kernelClient, setKernelClient] = useState<any>(null);
  const [sessionClient, setSessionClient] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [transferHash, setTransferHash] = useState(null);
  const [transferLoading, setTransferLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [ethBalance, setEthBalance] = useState<bigint | null>(null);
  const [checkingBalance, setCheckingBalance] = useState(false);

  // Target address for sending funds
  const TARGET_ADDRESS = "0x8D33614Cbc97B59F8408aD67E520549F57F80055";
  // Amount for ETH transfer (0.001 ETH)
  const AMOUNT_ETH = BigInt(1000000000000000); // 0.001 ETH (in wei)

  // Function to load the existing wallet and session key from storage
  useEffect(() => {
    async function loadExistingWallet() {
      if (!authenticated || !wallets.length || isInitialized || !user?.id) return;
      
      try {
        setIsLoading(true);
        
        // Try to load wallet info from API
        try {
          const response = await axios.get(API_ENDPOINTS.getWalletData(user.id));
          
          if (response.data) {
            const { walletInfo: walletData, sessionKeyInfo: sessionData } = response.data;
            
            console.log("Found saved wallet data:", walletData);
            console.log("Found saved session data:", sessionData);
            
            // Initialize the wallet and session client using the saved data
            await initializeFromSavedData(walletData, sessionData);
          }
        } catch (error) {
          console.log("No existing wallet data found for this user");
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
  }, [authenticated, wallets, user?.id]);

  // Effect to check balance when wallet is initialized
  useEffect(() => {
    if (walletInfo?.address) {
      checkEthBalance();
    }
  }, [walletInfo?.address]);

  // Function to check ETH balance
  async function checkEthBalance() {
    if (!walletInfo?.address) return;

    setCheckingBalance(true);
    try {
      // Check ETH balance
      const publicClient = createPublicClient({
        chain: base,
        transport: http(BASE_CONFIG.publicRpc),
      });
      
      const eth = await publicClient.getBalance({
        address: walletInfo.address as `0x${string}`,
      });
      
      setEthBalance(eth);
    } catch (error) {
      console.error("Error checking ETH balance:", error);
    } finally {
      setCheckingBalance(false);
    }
  }

  // Initialize kernel clients from saved data
  async function initializeFromSavedData(walletData: any, sessionData: any) {
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
        bundlerTransport: http(BASE_CONFIG.bundlerRpc),
      });
      
      setKernelClient(myKernelClient);
      setWalletInfo(walletData as WalletInfo);
      
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
        bundlerTransport: http(BASE_CONFIG.bundlerRpc),
      });
      
      setSessionClient(mySessionClient);
      setSessionKeyInfo(sessionData as SessionKeyInfo);
      
      toast.success("Loaded existing wallet and session key");
    } catch (error) {
      console.error("Error initializing from saved data:", error);
      toast.error("Failed to initialize the saved wallet");
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
      
      const paymasterClient = createZeroDevPaymasterClient({
        chain: base,
        transport: http(BASE_CONFIG.zerodev_paymaster_url),
      });
      
      // Create kernel account client with BASE network and paymaster
      const myKernelClient = createKernelAccountClient({
        account,
        chain: base,
        bundlerTransport: http(BASE_CONFIG.bundlerRpc),
        paymaster: {
          getPaymasterData: (userOperation) => {
            return paymasterClient.sponsorUserOperation({
              userOperation,
            })
          }
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
      } as WalletInfo;
      
      setWalletInfo(smartWalletInfo);
      
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
        bundlerTransport: http(BASE_CONFIG.bundlerRpc),
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
      
      // Save session key info to state
      const sessionInfo = {
        address: sessionKeySigner.address,
        privateKey: sessionKeyPrivateKey,
        accountAddress: sessionKeyAccount.address,
        network: "BASE"
      } as SessionKeyInfo;
      
      setSessionKeyInfo(sessionInfo);
      
      // Save to API for persistence
      if (user?.id) {
        try {
          await axios.post(API_ENDPOINTS.saveWalletData, {
            userId: user.id,
            walletInfo: smartWalletInfo,
            sessionKeyInfo: sessionInfo
          });
          console.log("Wallet data saved to API");
        } catch (error) {
          console.error("Error saving wallet data to API:", error);
          toast.error("Failed to save wallet data");
        }
      } else {
        console.warn("No user ID available, cannot save wallet data");
      }
      
      toast.success("Session Key created and linked to smart wallet on BASE!");
      
      // Check balance after wallet creation
      setTimeout(() => checkEthBalance(), 2000);
      
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
    // Delete wallet data from API
    if (user?.id) {
      axios.delete(API_ENDPOINTS.deleteWalletData, {
        data: { userId: user.id }
      }).catch(error => {
        console.error("Error deleting wallet data from API:", error);
      });
    }
    
    setWalletInfo(null);
    setSessionKeyInfo(null);
    setKernelClient(null);
    setSessionClient(null);
    setTransferHash(null);
    setEthBalance(null);
    toast.success("Wallet data cleared. You can now create a new wallet.");
  }

  // Function to send ETH
  async function sendETH() {
    if (!sessionClient) {
      toast.error("No session client available. Please create a wallet first.");
      return;
    }

    if (!ethBalance || ethBalance < AMOUNT_ETH) {
      toast.error("Insufficient ETH balance. Please fund your wallet first.");
      return;
    }

    setTransferLoading(true);
    try {
      const txHash = await transferETH(
        sessionClient,
        TARGET_ADDRESS,
        AMOUNT_ETH
      );
      
      setTransferHash(txHash);
      toast.success("Successfully sent 0.001 ETH!");
      
      // Update balance after transfer
      setTimeout(() => checkEthBalance(), 5000);
      
      return txHash;
    } catch (error) {
      toast.error("Error sending ETH");
      console.error("Error sending ETH:", error);
    } finally {
      setTransferLoading(false);
    }
  }

  // Function to fund the user's smart wallet
  async function fundUserWallet() {
    if (!walletInfo) {
      toast.error("No wallet information available. Please create a wallet first.");
      return;
    }

    try {
      setIsLoading(true);
      await fundWallet(walletInfo.address);
      toast.success("Funding process initiated!");
      
      // Schedule a check for updated balance
      setTimeout(() => checkEthBalance(), 10000);
    } catch (error) {
      console.error("Error funding wallet:", error);
      toast.error("Failed to fund wallet");
    } finally {
      setIsLoading(false);
    }
  }

  // Handle logout
  const handleLogout = async () => {
    try {
      await logout();
      // Don't clear wallet data on logout for persistence
      toast.success("Logged out successfully");
    } catch (error) {
      console.error("Error logging out:", error);
      toast.error("Error logging out");
    }
  };

  // Format ETH balance for display (18 decimals)
  const formatEthBalance = (balance: bigint | null) => {
    if (balance === null) return "Loading...";
    return (Number(balance) / 1_000_000_000_000_000_000).toFixed(6);
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
              disabled={false}
              color="blue"
            >
              Login
            </Button>
          ) : (
            <Button 
              onClick={handleLogout}
              disabled={false}
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
                  disabled={false}
                  color="red"
                >
                  Reset Wallet
                </Button>
              )}
              
              {sessionClient && (
                <Button 
                  onClick={sendETH}
                  disabled={transferLoading || !sessionClient || !ethBalance || ethBalance < AMOUNT_ETH}
                  color="green"
                >
                  {transferLoading ? "Sending..." : "Send 0.001 ETH"}
                </Button>
              )}
              
              {walletInfo && (
                <Button 
                  onClick={fundUserWallet}
                  disabled={isLoading}
                  color="blue"
                >
                  {isLoading ? "Opening..." : "Fund Wallet"}
                </Button>
              )}
              
              {walletInfo && (
                <Button 
                  onClick={checkEthBalance}
                  disabled={checkingBalance}
                  color="gray"
                >
                  {checkingBalance ? "Checking..." : "Refresh Balance"}
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
                      <span className="font-semibold">ETH Balance:</span> {formatEthBalance(ethBalance)} ETH
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
                <InfoCard title="Transfer ETH" color="indigo">
                  <p className="mb-4">Send 0.001 ETH to: 
                    <span className="font-mono text-sm ml-2 bg-indigo-100 p-1 rounded">{TARGET_ADDRESS}</span>
                  </p>
                  
                  {ethBalance && ethBalance < AMOUNT_ETH && (
                    <div className="mb-4 p-3 border rounded-lg bg-yellow-50">
                      <p className="text-yellow-800">
                        <span className="font-semibold">Warning:</span> Insufficient ETH balance. 
                        Please fund your wallet first.
                      </p>
                    </div>
                  )}
                  
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
        <title>ETH on BASE Transfer Demo</title>
        <meta name="description" content="A proof of concept for Privy authentication and ETH transfers on BASE" />
      </Head>
      
      <PrivyProvider 
        appId={BASE_CONFIG.projectId}
        config={{
          fundingMethodConfig: {
            moonpay: {
              paymentMethod: 'credit_debit_card',
              uiConfig: {
                accentColor: '#696FFD',
                theme: 'light',
              },
            },
          },
        }}
      >
        <MainApp />
      </PrivyProvider>
    </>
  );
}