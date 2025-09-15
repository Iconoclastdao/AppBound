
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

// --- OpenZeppelin Imports ---
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title Collectible License NFT (Ultimate Edition)
 * @author James Chapman 
 * @notice Fully ERC721-compliant, modular, and highly adoptable license NFT with soulbound, ephemeral, royalty, and batch minting support.
 */
contract CollectibleLicenseNFT is
    ERC721Enumerable,
    ERC721URIStorage,
    ERC2981,
    AccessControl,
    ReentrancyGuard
{
    // --- Roles ---
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    // --- License Data ---
    struct License {
        string appId;
        uint64 expiry;
        bool soulbound;
        bool ephemeral;
    }
    mapping(uint256 => License) public licenses;
    mapping(address => mapping(bytes32 => uint256)) public userAppToken;
    mapping(uint256 => bool) public redeemed;

    // --- Token Counter ---
    uint256 public nextTokenId;
    uint256 public immutable MAX_SUPPLY;

    // --- Minting Controls ---
    bool public openMinting = false;
    bytes32 public merkleRoot; // For allowlist (optional)

    // --- Events ---
    event LicenseMinted(address indexed to, uint256 indexed tokenId, string appId, uint64 expiry);
    event Redeemed(address indexed user, uint256 indexed tokenId);

    // --- Constructor ---
    constructor(
        string memory name_,
        string memory symbol_,
        uint256 maxSupply_,
        address royaltyReceiver,
        uint96 royaltyFeeNumerator
    ) ERC721(name_, symbol_) {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(MINTER_ROLE, msg.sender);
        MAX_SUPPLY = maxSupply_;
        _setDefaultRoyalty(royaltyReceiver, royaltyFeeNumerator);
    }

    // --- Minting ---
    function mintCollectible(
        address to,
        string calldata tokenURI_,
        string calldata appId,
        uint64 expiry,
        bool soulbound,
        bool ephemeral,
        address royaltyReceiver,
        uint96 royaltyFraction
    ) external onlyRole(MINTER_ROLE) returns (uint256) {
        require(nextTokenId < MAX_SUPPLY, "Max supply reached");
        uint256 tokenId = ++nextTokenId;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, tokenURI_);

        // License logic
        if (bytes(appId).length > 0) {
            bytes32 aHash = keccak256(bytes(appId));
            require(userAppToken[to][aHash] == 0, "User already owns this app");
            licenses[tokenId] = License(appId, expiry, soulbound, ephemeral);
            userAppToken[to][aHash] = tokenId;
            emit LicenseMinted(to, tokenId, appId, expiry);
        }

        // Royalty logic
        if (royaltyReceiver != address(0)) {
            _setTokenRoyalty(tokenId, royaltyReceiver, royaltyFraction);
        }
        return tokenId;
    }

    // --- Open Minting (optional, with allowlist) ---
    function openMint(
        string calldata tokenURI_,
        string calldata appId,
        uint64 expiry,
        bool soulbound,
        bool ephemeral,
        bytes32[] calldata merkleProof
    ) external nonReentrant returns (uint256) {
        require(openMinting, "Open minting disabled");
        require(nextTokenId < MAX_SUPPLY, "Max supply reached");

        // Optional allowlist check
        if (merkleRoot != 0) {
            bytes32 leaf = keccak256(abi.encodePacked(msg.sender));
            require(MerkleProof.verify(merkleProof, merkleRoot, leaf), "Not allowlisted");
        }

        uint256 tokenId = ++nextTokenId;
        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, tokenURI_);

        if (bytes(appId).length > 0) {
            bytes32 aHash = keccak256(bytes(appId));
            require(userAppToken[msg.sender][aHash] == 0, "User already owns this app");
            licenses[tokenId] = License(appId, expiry, soulbound, ephemeral);
            userAppToken[msg.sender][aHash] = tokenId;
            emit LicenseMinted(msg.sender, tokenId, appId, expiry);
        }
        return tokenId;
    }

    // --- Batch Minting ---
    function batchMint(
        address[] calldata recipients,
        string[] calldata uris,
        string[] calldata appIds,
        uint64[] calldata expiries,
        bool[] calldata soulbounds,
        bool[] calldata ephemerals,
        address[] calldata royaltyReceivers,
        uint96[] calldata royaltyFractions
    ) external onlyRole(MINTER_ROLE) {
        require(
            recipients.length == uris.length &&
            uris.length == appIds.length &&
            appIds.length == expiries.length &&
            expiries.length == soulbounds.length &&
            soulbounds.length == ephemerals.length &&
            ephemerals.length == royaltyReceivers.length &&
            royaltyReceivers.length == royaltyFractions.length,
            "Array length mismatch"
        );
        for (uint256 i = 0; i < recipients.length; i++) {
            mintCollectible(
                recipients[i],
                uris[i],
                appIds[i],
                expiries[i],
                soulbounds[i],
                ephemerals[i],
                royaltyReceivers[i],
                royaltyFractions[i]
            );
        }
    }

    // --- Redeem Ephemeral Content ---
    function redeem(uint256 tokenId) external nonReentrant {
        require(ownerOf(tokenId) == msg.sender, "Not owner");
        License memory lic = licenses[tokenId];
        require(lic.ephemeral, "Not ephemeral");
        require(!redeemed[tokenId], "Already redeemed");

        redeemed[tokenId] = true;
        emit Redeemed(msg.sender, tokenId);
    }

    // --- Burn ---
    function burn(uint256 tokenId) external nonReentrant {
        require(ownerOf(tokenId) == msg.sender, "Not owner");
        License memory lic = licenses[tokenId];
        if (bytes(lic.appId).length > 0) {
            bytes32 aHash = keccak256(bytes(lic.appId));
            delete userAppToken[msg.sender][aHash];
            delete licenses[tokenId];
        }
        _burn(tokenId);
    }

    // --- Transfers (Soulbound logic) ---
    function _beforeTokenTransfer(address from, address to, uint256 tokenId, uint256 batchSize)
        internal
        override(ERC721, ERC721Enumerable)
    {
        super._beforeTokenTransfer(from, to, tokenId, batchSize);
        if (from != address(0) && to != address(0)) {
            require(!licenses[tokenId].soulbound, "Token is soulbound");
            // Update license mapping
            License memory lic = licenses[tokenId];
            if (bytes(lic.appId).length > 0) {
                bytes32 aHash = keccak256(bytes(lic.appId));
                if (userAppToken[from][aHash] == tokenId) {
                    delete userAppToken[from][aHash];
                }
                userAppToken[to][aHash] = tokenId;
            }
        }
    }

    // --- Admin Controls ---
    function setOpenMinting(bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        openMinting = enabled;
    }

    function setMerkleRoot(bytes32 root) external onlyRole(DEFAULT_ADMIN_ROLE) {
        merkleRoot = root;
    }

    function setDefaultRoyalty(address receiver, uint96 feeNumerator) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setDefaultRoyalty(receiver, feeNumerator);
    }

    // --- Required Overrides ---
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable, ERC2981, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function _burn(uint256 tokenId) internal override(ERC721, ERC721URIStorage) {
        super._burn(tokenId);
        _resetTokenRoyalty(tokenId);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }
}
