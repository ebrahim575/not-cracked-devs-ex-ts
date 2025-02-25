import { useState, useEffect } from "react";
import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import Head from "next/head";
import toast from "react-hot-toast";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient } from 'viem';
import { mainnet } from 'viem/chains'; // Ethereum mainnet, or any other chain you prefer
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
  // Add state for kernel account address
  const [kernelAccountAddress, setKernelAccountAddress] = useState(null);

  async function getSmartWallet(wallets) {
    const embeddedWallet = wallets.find(
      (wallet) => wallet.walletClientType === "privy"
    );

    if (!embeddedWallet) {
      console.log("No Privy embedded wallet found");
    } else {
      console.log('Found embedded wallet');
    }

    // const provider = await embeddedWallet.getEthereumProvider();
    // Generate a private key
    const privateKey = generatePrivateKey();


    console.log("Private key generated : ",privateKey);
    const smartAccountSigner = privateKeyToAccount(privateKey);
    console.log('Type of smartAccountSigner:', typeof smartAccountSigner);
    console.log('Session Signer', smartAccountSigner);

    const publicClient = createPublicClient({
      chain: mainnet, // or use a different chain like 'polygon', 'goerli', etc.
      transport: http(), // Transport layer (using HTTP)
    });

    // Now you can use sessionSigner to sign transactions, etc.

    const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
      signer: smartAccountSigner,
      entryPoint: getEntryPoint("0.7"), // Fetching the entry point for version 0.7
      kernelVersion: KERNEL_V3_1,       // Using Kernel version 3.1
    });

    const account = await createKernelAccount(publicClient, {
      kernelVersion: KERNEL_V3_1, // Use Kernel version 3.1
      plugins: {
        sudo: ecdsaValidator, // Assuming ecdsaValidator is defined
      },
      entryPoint: getEntryPoint("0.7"), // Get the correct EntryPoint for version 0.7
    });
    
    // Create Kernel Account Client with the correct entryPoint
    const myKernelAccount = createKernelAccountClient({
      account,
      chain: mainnet,
      bundlerTransport: http(process.env.NEXT_PUBLIC_ZERODEV_BUNDLER_URL),
    });
    console.log('My Kernel Account', myKernelAccount);
    const accountAddress = myKernelAccount.account.address;
    console.log('My Kernel Account Address:', accountAddress);
    
    // Save the kernel account address to state
    setKernelAccountAddress(accountAddress);
    
    return myKernelAccount;
  }

  async function approveSessionKey({ sessionKeyAddress, wallets, strategy }) {
    if (!sessionKeyAddress) {
        toast.error("Session key address is required");
        throw new Error("Session key address is required");
    }
    try {
        const publicClient = createPublicClient({ chain: mainnet, transport: http() });
        const embeddedWallet = wallets.find(wallet => wallet.walletClientType === "privy");
        if (!embeddedWallet) {
            toast.error("No Privy embedded wallet found");
            throw new Error("No Privy embedded wallet found");
        }

        // const provider = await embeddedWallet.getEthereumProvider();
        const privateKey = generatePrivateKey();
        const smartAccountSigner = privateKeyToAccount(privateKey);
        const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
            signer: smartAccountSigner,
            entryPoint: getEntryPoint("0.7"),
            kernelVersion: KERNEL_V3_1,
        });

        const emptySessionKeySigner = await toECDSASigner({ signer: sessionKeyAddress });
        const permissionPlugin = await toPermissionValidator(publicClient, {
            entryPoint: getEntryPoint("0.7"),
            signer: emptySessionKeySigner,
            policies: [],
            kernelVersion: KERNEL_V3_1,
        });

        const sessionKeyAccount = await createKernelAccount(publicClient, {
            entryPoint: getEntryPoint("0.7"),
            plugins: { sudo: ecdsaValidator, regular: permissionPlugin },
            kernelVersion: KERNEL_V3_1,
            index: BigInt(strategy.key),
        });

        console.log('we did it : ', sessionKeyAccount);
        return serializePermissionAccount(sessionKeyAccount);
    } catch (error) {
        toast.error("Failed to approve session key");
        console.error("Error approving session key:", error);
        throw error;
    }
  }

  // "Get Smart Wallet" Button
  function GetSmartWalletButton() {
    const handleGetSmartWallet = async () => {
      try {
        await getSmartWallet(wallets);
        toast.success("Smart Wallet created!");
      } catch (error) {
        toast.error("Error getting smart wallet");
        console.error("Error in getSmartWallet:", error);
      }
    };

    return (
      <button
        type="button"
        onClick={handleGetSmartWallet}
        className="text-white bg-yellow-700 hover:bg-yellow-800 focus:ring-4 focus:ring-yellow-300 font-medium rounded-lg text-sm px-5 py-2.5 me-2 mb-2 dark:bg-yellow-600 dark:hover:bg-yellow-700 focus:outline-none dark:focus:ring-yellow-800"
      >
        Get Smart Wallet
      </button>
    );
  }

  // Approve Session Key Button
  function ApproveSessionKeyButton() {
    const handleApproveSessionKey = async () => {
      if (!kernelAccountAddress) {
        toast.error("No kernel account address available. Please create a smart wallet first.");
        return;
      }
      
      try {
        await approveSessionKey({
          sessionKeyAddress: kernelAccountAddress, // Use the stored kernel account address
          wallets,
          strategy: { key: "1" },
        });
        toast.success("Session Key Approved!");
      } catch (error) {
        toast.error("Error approving session key");
        console.error("Error:", error);
      }
    };

    return (
      <button
        type="button"
        onClick={handleApproveSessionKey}
        className="text-white bg-green-700 hover:bg-green-800 focus:ring-4 focus:ring-green-300 font-medium rounded-lg text-sm px-5 py-2.5 me-2 mb-2 dark:bg-green-600 dark:hover:bg-green-700 focus:outline-none dark:focus:ring-green-800"
        disabled={!kernelAccountAddress}
      >
        Approve Session Key
      </button>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="flex flex-col items-center justify-center gap-6">
        <h1 className="text-4xl font-bold">Privy Login Demo</h1>
        <LoginButton />
        {authenticated && (
          <>
            <WalletInfo />
            <GetSmartWalletButton />
            {kernelAccountAddress && (
              <div className="mt-4 p-4 border rounded-lg bg-gray-50 w-full break-words">
                <h2 className="text-xl font-semibold mb-2">Kernel Account</h2>
                <p>Address: {kernelAccountAddress}</p>
              </div>
            )}
            <ApproveSessionKeyButton />
            <div className="mt-4 p-4 border rounded-lg bg-gray-50">
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