# AppBound White Paper

## 1 — High-level Summary

**AppBound** is a decentralized application licensing platform where each ERC-721 token represents a bound license — one NFT = one user license per `appId`. Ownership of the NFT grants verified access to the corresponding application, whether AI, SaaS, or any digital service. Access is enforced by a backend that verifies ownership on-chain and issues short-lived access tokens. Transfers are automatically reconciled via an on-chain event listener, so access rights follow the NFT.

---

## 2 — Architecture Overview

**Key Components:**

* **Smart Contracts (Solidity, OpenZeppelin):**
    `AIAppLicense` (renamed `AppBoundLicense`) — ERC721 + ERC2981 royalties + admin minting + per-user-per-app enforcement + optional expiry + events.
* **Backend (Node.js/Express):**
    Uses ethers.js, PostgreSQL or Redis for nonces, sessions, and token → app instance mapping. Listens to `Transfer` events to reconcile ownership. Issues JWT-style ephemeral access tokens after wallet signature and on-chain verification.
* **Application Layer:**
    * Supports any application type: AI models, SaaS platforms, digital tools, or web apps.
    * Access enforcement options:
        * **Dedicated instance per token** (Docker/Kubernetes)
        * **Shared multi-tenant app** with per-token credentials and strict rate/compute limits
* **Frontend (React + TypeScript):**
    Wallet connect, nonce signing, access token retrieval, launch of the licensed app UI.
* **Storage:**
    Metadata stored on IPFS/Pinata/Estuary. TokenURI points to JSON containing `appId`, `features`, `expiry`, and other metadata.

---

## 3 — Smart Contract Design

**contracts/AppBoundLicense.sol:**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract AppBoundLicense is ERC721URIStorage, ERC2981, Ownable, ReentrancyGuard {
    uint256 public nextTokenId;

    struct License {
        string appId;
        uint64 expiry;
    }

    mapping(uint256 => License) public licenses;
    mapping(address => mapping(bytes32 => uint256)) public userAppToken;

    event LicenseMinted(address indexed to, uint256 indexed tokenId, string appId, uint64 expiry);
    event LicenseBurned(address indexed owner, uint256 indexed tokenId);
    event LicenseRevoked(uint256 indexed tokenId);

    constructor(string memory name_, string memory symbol_) ERC721(name_, symbol_) {}

    function mintTo(
        address to,
        string calldata appId,
        string calldata tokenURI,
        uint64 expiry,
        address royaltyReceiver,
        uint96 royaltyBps
    ) external onlyOwner returns (uint256) {
        bytes32 aHash = keccak256(bytes(appId));
        require(userAppToken[to][aHash] == 0, "ALREADY_OWN_THIS_APP");

        uint256 tokenId = ++nextTokenId;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, tokenURI);

        licenses[tokenId] = License(appId, expiry);
        userAppToken[to][aHash] = tokenId;

        if (royaltyReceiver != address(0)) {
            _setTokenRoyalty(tokenId, royaltyReceiver, royaltyBps);
        }

        emit LicenseMinted(to, tokenId, appId, expiry);
        return tokenId;
    }

    function burn(uint256 tokenId) external nonReentrant {
        require(ownerOf(tokenId) == msg.sender, "NOT_OWNER");
        bytes32 aHash = keccak256(bytes(licenses[tokenId].appId));
        delete licenses[tokenId];
        delete userAppToken[msg.sender][aHash];
        _burn(tokenId);
        emit LicenseBurned(msg.sender, tokenId);
    }

    function revoke(uint256 tokenId) external onlyOwner {
        address owner = ownerOf(tokenId);
        bytes32 aHash = keccak256(bytes(licenses[tokenId].appId));
        delete licenses[tokenId];
        if (userAppToken[owner][aHash] == tokenId) {
            delete userAppToken[owner][aHash];
        }
        _burn(tokenId);
        emit LicenseRevoked(tokenId);
    }

    function _beforeTokenTransfer(address from, address to, uint256 tokenId) internal override {
        super._beforeTokenTransfer(from, to, tokenId);
        if (from != address(0) && to != address(0)) {
            bytes32 aHash = keccak256(bytes(licenses[tokenId].appId));
            if (userAppToken[from][aHash] == tokenId) {
                delete userAppToken[from][aHash];
            }
            userAppToken[to][aHash] = tokenId;
        }
    }

    function checkLicense(address user, string calldata appId) external view returns (uint256 tokenId, string memory metadataURI, uint64 expiry) {
        bytes32 aHash = keccak256(bytes(appId));
        tokenId = userAppToken[user][aHash];
        if (tokenId != 0) {
            metadataURI = tokenURI(tokenId);
            expiry = licenses[tokenId].expiry;
        }
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC721, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function setDefaultRoyalty(address receiver, uint96 feeNumerator) external onlyOwner {
        _setDefaultRoyalty(receiver, feeNumerator);
    }

    function deleteDefaultRoyalty() external onlyOwner {
        _deleteDefaultRoyalty();
    }

    function adminSetTokenURI(uint256 tokenId, string calldata uri) external onlyOwner {
        _setTokenURI(tokenId, uri);
    }
}
```

---

## Notes
- Enforces one license per user per app.
- ERC2981 ensures royalty support for marketplaces.
- `_beforeTokenTransfer` keeps ownership mapping consistent.

---

## 4 — Deployment
- Use Hardhat for contract compilation and deployment.
- Example .env:
```
PRIVATE_KEY=0x...
RPC_URL=https://polygon-rpc.com
CONTRACT_NAME=AppBoundLicense
TOKEN_NAME=AppBoundLicense
TOKEN_SYMBOL=ABND
```
- Deployment script with ethers.js.

---

## 5 — Backend: Auth & Access Control
- Wallet signature (eth_sign) proves ownership.
- Backend validates `userAppToken` mapping.
- Issues ephemeral JWT tokens for app access (5–15 min).
- Event listener tracks NFT transfers, revoking sessions if ownership changes.
- Supports multi-tenant or per-token isolated app deployments.

---

## 6 — Frontend: Wallet Connect + Access
- Connect wallet.
- Retrieve nonce, sign message, request ephemeral token.
- Token grants access to the licensed app.
- Works with any type of application (AI, SaaS, digital tools).

---

## 7 — Application Layer Integration
Options:
- **Per-token dedicated instance**
  - Full isolation for high-value apps or AI models.
  - Pros: personalization, security.
  - Cons: cost.
- **Shared application with per-token credentials**
  - Cheaper, scalable.
  - Backend enforces per-token rate limits and compute quotas.

---

## 8 — Marketplace & Royalties
- ERC2981 ensures royalty info is respected by marketplaces.
- NFT ownership transfer automatically updates access rights.
- Optional resale restrictions can be implemented but may reduce user experience.

---

## 9 — Security & Hardening
- Contracts: Pausable, AccessControl, audited code.
- Backend: secure JWT secrets, HSMs for critical keys.
- Tokens: short-lived, signed nonce messages to prevent replay attacks.
- Data: HTTPS, CSP, helmet headers for frontend.
- Testing: unit & integration tests for contracts, backend, and transfer flows.

---

## 10 — CI/CD & Testing
- Hardhat + Waffle/Chai for contract testing.
- Backend integration tests simulate signatures, access, and transfers.
- GitHub Actions for CI: lint, test, build, deploy, verify.

---

## 11 — Database Schema (Postgres)
```sql
CREATE TABLE nonces (
  address TEXT PRIMARY KEY,
  nonce TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL
);

CREATE TABLE sessions (
  id SERIAL PRIMARY KEY,
  token_id TEXT,
  address TEXT,
  access_token TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  valid BOOLEAN DEFAULT TRUE
);

CREATE TABLE app_instances (
  token_id TEXT PRIMARY KEY,
  endpoint TEXT,
  provisioned_at TIMESTAMP
);
```

---

## 12 — Deployment Checklist
- Compile & deploy contract (hardhat deploy).
- Start backend (npm run start:server).
- Start frontend (npm run start:frontend).
- Configure environment variables correctly.

---

## 13 — UX & Product Considerations
- Onboarding: gasless mint or marketplace mint options.
- Recoverability: optional off-chain admin recovery for lost wallets.
- Licensing Models: perpetual, subscription, expiry-based leases.
- Analytics: usage tracking per token for billing or dashboards.

---

## 14 — Vision
AppBound transforms NFTs into general-purpose, enforceable digital licenses, unifying software distribution, access control, and royalty enforcement into a decentralized, user-bound ecosystem. Every NFT is no longer just a collectible — it is the license, the key, and the account itself.
