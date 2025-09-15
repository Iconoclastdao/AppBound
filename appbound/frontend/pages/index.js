
// frontend/pages/index.js
import React, { useState } from "react";
import axios from "axios";

export default function Home() {
  const [address, setAddress] = useState(null);
  const [message, setMessage] = useState("");

  async function connectWallet() {
    if (!window.ethereum) return alert("Install MetaMask");
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    setAddress(accounts[0]);
  }

  async function checkAccess() {
    if (!address) return alert("Connect wallet first");
    try {
      const res = await axios.post("http://localhost:5000/api/auth", { wallet: address, appId: "demo-app" });
      if (res.data.success) setMessage("✅ Access granted — token: " + res.data.accessToken);
      else setMessage("❌ No license");
    } catch (e) {
      setMessage("❌ Error: " + (e.response?.data?.error || e.message));
    }
  }

  return (
    <div style={{ padding: 20, fontFamily: "system-ui, sans-serif" }}>
      <h1>AppBound — Demo</h1>
      {!address ? (
        <button onClick={connectWallet}>Connect MetaMask</button>
      ) : (
        <div>
          <p>Connected: {address}</p>
          <button onClick={checkAccess}>Check Demo License</button>
        </div>
      )}
      <pre style={{ marginTop: 20 }}>{message}</pre>
      <p style={{ marginTop: 40, color: "#666" }}>
        For local testing: run Hardhat node, deploy contract (scripts/deploy.js), run scripts/seed.js to mint demo license.
      </p>
    </div>
  );
}
