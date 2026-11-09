
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract CertificateVerification {

    address public admin;

    struct Certificate {
        bytes32 certificateHash;
        address issuer;
        uint256 issueDate;
        bool revoked;
        bool exists;
    }

    mapping(bytes32 => Certificate) private certificates;
    mapping(address => bool) public authorizedIssuers;

    event IssuerAuthorized(address indexed issuer);
    event IssuerRemoved(address indexed issuer);

    event CertificateRegistered(
        bytes32 indexed certificateId,
        bytes32 certificateHash,
        address indexed issuer,
        uint256 issueDate
    );

    constructor() {
        admin = msg.sender;
        authorizedIssuers[msg.sender] = true;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can perform this action");
        _;
    }

    modifier onlyIssuer() {
        require(
            authorizedIssuers[msg.sender],
            "Not an authorized issuer"
        );
        _;
    }

    function authorizeIssuer(address issuer) external onlyAdmin {
        require(issuer != address(0), "Invalid issuer address");
        require(!authorizedIssuers[issuer], "Issuer already authorized");

        authorizedIssuers[issuer] = true;

        emit IssuerAuthorized(issuer);
    }

    function removeIssuer(address issuer) external onlyAdmin {
        require(issuer != admin, "Cannot remove admin");
        require(authorizedIssuers[issuer], "Issuer not authorized");

        authorizedIssuers[issuer] = false;

        emit IssuerRemoved(issuer);
    }

    function registerCertificate(
        bytes32 certificateId,
        bytes32 certificateHash
    ) external onlyIssuer {
        require(certificateId != bytes32(0), "Invalid certificate ID");
        require(certificateHash != bytes32(0), "Invalid certificate hash");
        require(!certificates[certificateId].exists, "Certificate already exists");

        certificates[certificateId] = Certificate({
            certificateHash: certificateHash,
            issuer: msg.sender,
            issueDate: block.timestamp,
            revoked: false,
            exists: true
        });

        emit CertificateRegistered(
            certificateId,
            certificateHash,
            msg.sender,
            block.timestamp
        );
    }

    function verifyCertificate(
        bytes32 certificateId,
        bytes32 uploadedHash
    )
        external
        view
        returns (
            bool exists,
            bool hashMatches,
            bool revoked,
            address issuer,
            uint256 issueDate
        )
    {
        Certificate memory cert = certificates[certificateId];

        if (!cert.exists) {
            return (false, false, false, address(0), 0);
        }

        return (
            true,
            cert.certificateHash == uploadedHash,
            cert.revoked,
            cert.issuer,
            cert.issueDate
        );
    }

    function getCertificate(
        bytes32 certificateId
    )
        external
        view
        returns (
            bytes32 certificateHash,
            address issuer,
            uint256 issueDate,
            bool revoked,
            bool exists
        )
    {
        Certificate memory cert = certificates[certificateId];

        return (
            cert.certificateHash,
            cert.issuer,
            cert.issueDate,
            cert.revoked,
            cert.exists
        );
    }
}
