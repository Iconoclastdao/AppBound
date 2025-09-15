
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract AppBoundLicense is ERC721URIStorage, ERC2981, Ownable, ReentrancyGuard {
    uint256 public nextTokenId;
    struct License { string appId; uint64 expiry; }
    mapping(uint256 => License) public licenses;
    mapping(address => mapping(bytes32 => uint256)) public userAppToken;
    event LicenseMinted(address indexed to, uint256 indexed tokenId, string appId, uint64 expiry);
    event LicenseBurned(address indexed owner, uint256 indexed tokenId);

    constructor() ERC721("AppBoundLicense", "ABND") {}

    function mintTo(address to, string calldata appId, string calldata tokenURI, uint64 expiry) external onlyOwner returns (uint256) {
        bytes32 aHash = keccak256(bytes(appId));
        require(userAppToken[to][aHash] == 0, "ALREADY_OWN_THIS_APP");
        uint256 tokenId = ++nextTokenId;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, tokenURI);
        licenses[tokenId] = License(appId, expiry);
        userAppToken[to][aHash] = tokenId;
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

    function _beforeTokenTransfer(address from, address to, uint256 tokenId) internal override {
        super._beforeTokenTransfer(from, to, tokenId);
        if (from != address(0) && to != address(0)) {
            bytes32 aHash = keccak256(bytes(licenses[tokenId].appId));
            if (userAppToken[from][aHash] == tokenId) delete userAppToken[from][aHash];
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
}
