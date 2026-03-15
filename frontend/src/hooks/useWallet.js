import { useState, useCallback } from "react";
import { ethers } from "ethers";
import { CHAIN_CONFIG } from "../utils/contracts.js";

export function useWallet() {
  const [account, setAccount] = useState(null);
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [balance, setBalance] = useState("0");

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      alert("Please install MetaMask to use ShieldX");
      return;
    }

    const browserProvider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await browserProvider.send("eth_requestAccounts", []);

    // Switch to Polkadot Hub TestNet if needed
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CHAIN_CONFIG.chainIdHex }],
      });
    } catch (switchError) {
      if (switchError.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: CHAIN_CONFIG.chainIdHex,
            chainName: CHAIN_CONFIG.name,
            nativeCurrency: CHAIN_CONFIG.currency,
            rpcUrls: [CHAIN_CONFIG.rpc],
            blockExplorerUrls: [CHAIN_CONFIG.explorer],
          }],
        });
      }
    }

    const walletSigner = await browserProvider.getSigner();
    const bal = await browserProvider.getBalance(accounts[0]);

    setProvider(browserProvider);
    setSigner(walletSigner);
    setAccount(accounts[0]);
    setBalance(ethers.formatEther(bal));
  }, []);

  const disconnect = useCallback(() => {
    setAccount(null);
    setProvider(null);
    setSigner(null);
    setBalance("0");
  }, []);

  return {
    account,
    provider,
    signer,
    balance,
    isConnected: !!account,
    connect,
    disconnect,
  };
}
