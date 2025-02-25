import { useState, useEffect } from "react";
import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import Head from "next/head";
import toast from "react-hot-toast";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient } from 'viem';
import { base } from 'viem/chains'; // Import BASE network instead of mainnet
import { http } from 'viem';
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator"
import { getEntryPoint, KERNEL_V3_1 } from "@zerodev/sdk/constants";
import { createKernelAccount, createKernelAccountClient } from "@zerodev/sdk"; // Import the necessary functions
import { generatePrivateKey } from "viem/accounts";
import { serializePermissionAccount, toPermissionValidator } from "@zerodev/permissions";
import { toECDSASigner } from "@zerodev/permissions/signers";

// Login Button Component
function LoginButton() {
  const { login, authenticated } = usePrivy();

  return (
    <button
      type="button"
      onClick={authenticated ? undefined : login}
      className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 me-2 mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none dark:focus:ring-blue-800"
    >
      {authenticated ? "Connected" : "Login"}
    </button>
  );
}

// Wallet Info Component
function WalletInfo() {
  const { wallets } = useWallets(); // Hook to get wallets

  return (
    <div className="mt-4 p-4 border rounded-lg bg-gray-50">
      <h2 className="text-xl font-semibold mb-2">Wallet Information</h2>
      <p>
        Wallet Address: {wallets?.[0]?.address || "No wallet found"}
      </p>
    </div>
  );
}

// Main Application Component
function MainApp() {
  const { authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  
  // State for storing wallet and session key info
  const [walletInfo, setWalletInfo] = useState(null);
  const [sessionKeyInfo, setSessionKeyInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

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
        chain: base, // Use BASE network instead of mainnet
        transport: http(),
      });

      // ======= STEP 1: CREATE SMART WALLET =======
      
      // Generate a private key for the smart wallet
      const walletPrivateKey = generatePrivateKey();
      console.log("Smart wallet private key generated:", walletPrivateKey);
      
      const smartAccountSigner = privateKeyToAccount(walletPrivateKey);
      console.log('Smart account signer:', smartAccountSigner);

      // Create ECDSA validator for the smart wallet
      const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
        signer: smartAccountSigner,
        entryPoint: getEntryPoint("0.7"),
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
        entryPoint: getEntryPoint("0.7"),
        index: accountIndex,
      });
      
      // Create kernel account client with BASE network
      const kernelClient = createKernelAccountClient({
        account,
        chain: base, // Use BASE network instead of mainnet
        bundlerTransport: http(process.env.NEXT_PUBLIC_ZERODEV_BUNDLER_URL),
      });
      
      console.log('Smart Wallet Account:', kernelClient);
      const smartWalletAddress = kernelClient.account.address;
      console.log('Smart Wallet Address:', smartWalletAddress);
      
      // Save smart wallet info to state
      const smartWalletInfo = {
        address: smartWalletAddress,
        privateKey: walletPrivateKey,
        index: accountIndex.toString(),
        network: "BASE"
      };
      
      setWalletInfo(smartWalletInfo);
      toast.success("Smart Wallet created on BASE network!");

      // ======= STEP 2: CREATE SESSION KEY =======
      
      // Generate a new session key
      const sessionKeyPrivateKey = generatePrivateKey();
      const sessionKeySigner = privateKeyToAccount(sessionKeyPrivateKey);
      console.log("Session key address:", sessionKeySigner.address);

      // Create the session key validator
      const sessionKeyValidator = await toECDSASigner({ signer: sessionKeySigner });
      
      // Create permission plugin for the session key
      const permissionPlugin = await toPermissionValidator(publicClient, {
        entryPoint: getEntryPoint("0.7"),
        signer: sessionKeyValidator,
        policies: [], // Empty means all permissions allowed
        kernelVersion: KERNEL_V3_1,
      });

      // Create the session key account with the SAME INDEX as the smart wallet
      const sessionKeyAccount = await createKernelAccount(publicClient, {
        entryPoint: getEntryPoint("0.7"),
        plugins: { 
          sudo: ecdsaValidator,     // Main key has full access
          regular: permissionPlugin // Session key has limited access
        },
        kernelVersion: KERNEL_V3_1,
        index: accountIndex, // Using the same index to link to the same wallet
      });

      console.log('Session key account created:', sessionKeyAccount);
      
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

  // Combined button for creating wallet and session key
  function CreateWalletAndSessionKeyButton() {
    const handleClick = async () => {
      await createWalletAndSessionKey();
    };

    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        className="text-white bg-purple-700 hover:bg-purple-800 focus:ring-4 focus:ring-purple-300 font-medium rounded-lg text-sm px-5 py-2.5 me-2 mb-2 dark:bg-purple-600 dark:hover:bg-purple-700 focus:outline-none dark:focus:ring-purple-800"
      >
        {isLoading ? "Creating..." : "Create Wallet & Session Key on BASE"}
      </button>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="flex flex-col items-center justify-center gap-6 w-full max-w-3xl">
        <h1 className="text-4xl font-bold">Privy Login Demo</h1>
        <LoginButton />
        {authenticated && (
          <>
            <WalletInfo />
            <CreateWalletAndSessionKeyButton />
            
            {walletInfo && (
              <div className="mt-4 p-4 border rounded-lg bg-gray-50 w-full break-words">
                <h2 className="text-xl font-semibold mb-2">Smart Wallet (BASE Network)</h2>
                <p>Address: {walletInfo.address}</p>
                <p>Index: {walletInfo.index}</p>
                <p>Network: {walletInfo.network}</p>
                <p className="mt-2 text-sm text-gray-500">Private key (for demo purposes only):</p>
                <p className="font-mono text-xs">{walletInfo.privateKey}</p>
              </div>
            )}
            
            {sessionKeyInfo && (
              <div className="mt-4 p-4 border rounded-lg bg-gray-50 w-full break-words">
                <h2 className="text-xl font-semibold mb-2">Session Key (BASE Network)</h2>
                <p>Session Key Address: {sessionKeyInfo.address}</p>
                <p>Linked to Wallet: {sessionKeyInfo.accountAddress}</p>
                <p>Network: {sessionKeyInfo.network}</p>
                <p className="mt-2 text-sm text-gray-500">Session private key (for demo purposes only):</p>
                <p className="font-mono text-xs">{sessionKeyInfo.privateKey}</p>
              </div>
            )}
            
            <div className="mt-4 p-4 border rounded-lg bg-gray-50 w-full">
              <h2 className="text-xl font-semibold mb-2">Connected User</h2>
              <p>User ID: {user?.id}</p>
              <p>Email: {user?.email?.address || "Not provided"}</p>
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