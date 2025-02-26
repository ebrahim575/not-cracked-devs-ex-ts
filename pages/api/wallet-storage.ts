import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

// Path to the JSON file that will store all wallet information
const WALLET_STORAGE_PATH = path.join(process.cwd(), 'wallet-storage.json');

// Interface for wallet information
interface WalletInfo {
  address: string;
  privateKey: string;
  index: string;
  network: string;
}

// Interface for session key information
interface SessionKeyInfo {
  address: string;
  privateKey: string;
  accountAddress: string;
  network: string;
}

// Interface for user wallet data
interface UserWalletData {
  walletInfo: WalletInfo;
  sessionKeyInfo: SessionKeyInfo;
}

// Interface for the storage file structure
interface StorageData {
  [userId: string]: UserWalletData;
}

// Initialize the storage file if it doesn't exist
function initializeStorageFile() {
  if (!fs.existsSync(WALLET_STORAGE_PATH)) {
    fs.writeFileSync(WALLET_STORAGE_PATH, JSON.stringify({}, null, 2));
  }
}

// Read data from the storage file
function readStorageData(): StorageData {
  initializeStorageFile();
  const data = fs.readFileSync(WALLET_STORAGE_PATH, 'utf8');
  try {
    return JSON.parse(data);
  } catch (error) {
    console.error('Error parsing wallet storage file:', error);
    return {};
  }
}

// Write data to the storage file
function writeStorageData(data: StorageData) {
  initializeStorageFile();
  fs.writeFileSync(WALLET_STORAGE_PATH, JSON.stringify(data, null, 2));
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // Ensure the storage file exists
  initializeStorageFile();

  // Handle different HTTP methods
  switch (req.method) {
    case 'GET':
      // Get wallet data for a specific user
      const { userId } = req.query;
      
      if (!userId || typeof userId !== 'string') {
        return res.status(400).json({ error: 'User ID is required' });
      }
      
      const storageData = readStorageData();
      const userData = storageData[userId];
      
      if (!userData) {
        return res.status(404).json({ error: 'User wallet data not found' });
      }
      
      return res.status(200).json(userData);
      
    case 'POST':
      // Save wallet data for a specific user
      const { userId: postUserId, walletInfo, sessionKeyInfo } = req.body;
      
      if (!postUserId || typeof postUserId !== 'string') {
        return res.status(400).json({ error: 'User ID is required' });
      }
      
      if (!walletInfo || !sessionKeyInfo) {
        return res.status(400).json({ error: 'Wallet info and session key info are required' });
      }
      
      const postStorageData = readStorageData();
      postStorageData[postUserId] = { walletInfo, sessionKeyInfo };
      writeStorageData(postStorageData);
      
      return res.status(200).json({ success: true });
      
    case 'DELETE':
      // Delete wallet data for a specific user
      const { userId: deleteUserId } = req.body;
      
      if (!deleteUserId || typeof deleteUserId !== 'string') {
        return res.status(400).json({ error: 'User ID is required' });
      }
      
      const deleteStorageData = readStorageData();
      
      if (!deleteStorageData[deleteUserId]) {
        return res.status(404).json({ error: 'User wallet data not found' });
      }
      
      delete deleteStorageData[deleteUserId];
      writeStorageData(deleteStorageData);
      
      return res.status(200).json({ success: true });
      
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
} 