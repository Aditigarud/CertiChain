
// ============================================
// CertiChain – Deployment configuration
// Ganache RPC : http://127.0.0.1:8545
// Chain ID    : 1337  (eth_chainId returns 0x539 = 1337)
// Deployed contract : IPFS-enabled CertificateVerification
// ============================================

window.CONTRACT_ADDRESS = "0x09F8B5C9c12DbD6c59a096f968b4Bb8080824552";

window.CONTRACT_ABI = [
  "function admin() view returns (address)",
  "function authorizedIssuers(address) view returns (bool)",
  "function authorizeIssuer(address issuer)",
  "function removeIssuer(address issuer)",
  "function registerCertificate(bytes32 certificateId, bytes32 certificateHash, string ipfsCID)",
  "function verifyCertificate(bytes32 certificateId, bytes32 uploadedHash) view returns (bool exists, bool hashMatches, bool revoked, address issuer, uint256 issueDate, string ipfsCID)",
  "function revokeCertificate(bytes32 certificateId)",
  "function getCertificate(bytes32 certificateId) view returns (bytes32 certificateHash, string ipfsCID, address issuer, uint256 issueDate, bool revoked, bool exists)"
];
