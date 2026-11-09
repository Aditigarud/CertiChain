# CertiChain – Academic Certificate Verification

CertiChain is a blockchain-based application that helps verify academic certificates and detect forged or modified documents.

## Features
- Register certificates using a unique Certificate ID.
- Generate SHA-256 hashes of PDF certificates.
- Store certificate PDFs on IPFS using Pinata.
- Verify certificates using blockchain records.
- Revoke certificates.
- Manage authorised issuers using MetaMask.

## Technologies Used
- Solidity
- Ganache
- Remix IDE
- MetaMask
- HTML, CSS, JavaScript
- Node.js and Express.js
- Ethers.js
- IPFS and Pinata

## How to Run

1. Clone the repository.
2. Install backend dependencies using `npm install` inside the backend folder.
3. Create a `.env` file in the backend folder and add your Pinata JWT.
4. Start the backend using `npm start`.
5. Start Ganache and connect MetaMask.
6. Open `frontend/index.html` using Live Server.

## Team Members
- Ken Fernandes – Smart Contract & Blockchain
- Aditi Garud – IPFS, Backend & Frontend