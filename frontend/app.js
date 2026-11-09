// ============================================
// CERTICHAIN - ACADEMIC CERTIFICATE VERIFICATION
// Frontend JavaScript - ethers.js v6
// ============================================

// Chain ID confirmed: MetaMask queried http://127.0.0.1:8545 and got 1337.
// Ganache's "Network ID" field (5777) is a legacy identifier — ignore it.
// eth_chainId (what MetaMask and ethers.js actually use) returns 1337.
const GANACHE_CHAIN_ID = 1337n;
const GANACHE_RPC_URL = "http://127.0.0.1:8545";
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const IPFS_BACKEND_URL = "http://localhost:5000/upload";
const IPFS_GATEWAY = "https://gateway.pinata.cloud/ipfs/";

let provider = null;
let signer = null;
let contract = null;
let currentAccount = null;
let isAdmin = false;
let isAuthorizedIssuer = false;

// Get an HTML element by its ID.
// Supports both kebab-case and camelCase IDs.
function $(...ids) {
  for (const id of ids) {
    const element = document.getElementById(id);
    if (element) return element;
  }
  return null;
}

// ============================================
// MESSAGE DISPLAY
// ============================================

function showMessage(message, type = "info") {
  const notice = $("notice", "globalMessage");

  if (!notice) {
    alert(message);
    return;
  }

  notice.textContent = message;
  notice.className = `notice ${type}`;
  notice.style.display = "block";
}

function showFormMessage(elementId, message, type = "info") {
  const element = $(elementId);

  if (element) {
    element.textContent = message;
    element.classList.remove("hidden");
    element.style.display = "block";
    element.className = `message ${type}`;
  } else {
    showMessage(message, type);
  }
}

// ============================================
// CERTIFICATE HASHING
// ============================================

// Convert a certificate ID into bytes32.
// The same ID must be used when issuing and verifying.
function getCertificateIdHash(certificateId) {
  return ethers.keccak256(
    ethers.toUtf8Bytes(certificateId.trim())
  );
}

// Calculate the SHA-256 hash of a selected file.
async function getFileHash(file) {
  if (!file) {
    throw new Error("Please select a certificate file.");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error("The file must not exceed 20 MB.");
  }

  if (!window.crypto || !window.crypto.subtle) {
    throw new Error(
      "Secure file hashing is unavailable. Open the website using VS Code Live Server."
    );
  }

  const fileBuffer = await file.arrayBuffer();

  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    fileBuffer
  );

  return ethers.hexlify(new Uint8Array(hashBuffer));
}

// ============================================
// WALLET AND ROLE DISPLAY
// ============================================

function updateWalletUI() {
  const walletStatus = $("wallet-status", "walletStatus");
  const walletAddress = $("wallet-address", "walletAddress");
  const networkBadge = $("network-badge");
  const connectButton = $("connect-wallet", "connectWallet");
  const roleStatus = $("role-status", "userRole");

  if (walletStatus) {
    walletStatus.textContent = currentAccount
      ? "Wallet connected"
      : "Wallet not connected";
  }

  if (walletAddress) {
    walletAddress.textContent = currentAccount
      ? currentAccount
      : "Connect MetaMask to interact with the blockchain.";
  }

  if (networkBadge) {
    networkBadge.textContent = currentAccount
      ? "Ganache · Chain 1337"
      : "Not connected";

    networkBadge.className = currentAccount
      ? "badge badge-blue"
      : "badge badge-muted";
  }

  if (connectButton) {
    connectButton.textContent = currentAccount
      ? "Wallet Connected"
      : "Connect MetaMask";
  }

  if (roleStatus) {
    if (!currentAccount) {
      roleStatus.textContent =
        "Connect your wallet to check your permissions.";
    } else if (isAdmin) {
      roleStatus.textContent =
        "Administrator: you can authorize and remove issuers.";
    } else if (isAuthorizedIssuer) {
      roleStatus.textContent =
        "Authorized issuer: you can register certificates.";
    } else {
      roleStatus.textContent =
        "Verifier: you can verify certificates but cannot issue them.";
    }
  }

  updateAccessUI();
}

function updateAccessUI() {
  document.querySelectorAll(".admin-only").forEach((element) => {
    element.style.display = isAdmin ? "" : "none";
  });

  document.querySelectorAll(".issuer-only").forEach((element) => {
    element.style.display =
      isAdmin || isAuthorizedIssuer ? "" : "none";
  });
}

// ============================================
// CONNECT METAMASK
// ============================================

async function connectWallet() {
  try {
    if (!window.ethereum) {
      throw new Error(
        "MetaMask was not detected. Install MetaMask and refresh the page."
      );
    }

    if (typeof ethers === "undefined") {
      throw new Error(
        "The ethers.js library did not load. Check your internet connection and refresh."
      );
    }

    if (
      !window.CONTRACT_ADDRESS ||
      window.CONTRACT_ADDRESS ===
      "PASTE_YOUR_DEPLOYED_CONTRACT_ADDRESS_HERE"
    ) {
      throw new Error(
        "Add your deployed contract address to config.js first."
      );
    }

    if (!window.CONTRACT_ABI) {
      throw new Error(
        "The contract ABI is missing from config.js."
      );
    }

    // ── DIAGNOSTIC BLOCK ────────────────────────────────────────────────
    // These logs expose exactly which chain ID each layer reports.
    // Open DevTools → Console to read them before the error fires.
    const rawChainIdHex = await window.ethereum.request({ method: "eth_chainId" });
    const rawChainIdDec = parseInt(rawChainIdHex, 16);
    console.group("CertiChain · Chain ID diagnostics");
    console.log("window.ethereum.chainId (property) :", window.ethereum.chainId);
    console.log("eth_chainId RPC result (hex)        :", rawChainIdHex);
    console.log("eth_chainId RPC result (decimal)    :", rawChainIdDec);
    console.log("App expects chain ID (decimal)      :", Number(GANACHE_CHAIN_ID));
    console.log("App expects RPC URL                 :", GANACHE_RPC_URL);
    // BrowserProvider network is resolved below; logged after getNetwork().
    // ────────────────────────────────────────────────────────────────────

    provider = new ethers.BrowserProvider(window.ethereum);

    await window.ethereum.request({
      method: "eth_requestAccounts"
    });

    const network = await provider.getNetwork();

    console.log("ethers BrowserProvider network.chainId :", network.chainId.toString());
    console.log("ethers BrowserProvider network.name    :", network.name);
    console.groupEnd();

    if (network.chainId !== GANACHE_CHAIN_ID) {
      // Attempt to switch MetaMask to the Ganache network automatically.
      console.warn(
        `Chain ID mismatch — got ${network.chainId}, expected ${GANACHE_CHAIN_ID}. Requesting MetaMask switch...`
      );

      try {
        // Try switching to the network if MetaMask already has it saved.
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x" + Number(GANACHE_CHAIN_ID).toString(16) }]
        });
      } catch (switchError) {
        // Error code 4902 = chain not found in MetaMask → add it.
        if (switchError.code === 4902) {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: "0x" + Number(GANACHE_CHAIN_ID).toString(16),
              chainName: "Ganache Local",
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
              rpcUrls: [GANACHE_RPC_URL]
            }]
          });
        } else {
          // User rejected the switch or another error occurred.
          throw new Error(
            `Wrong network (Chain ID ${network.chainId} detected; expected ${GANACHE_CHAIN_ID}). ` +
            `Open MetaMask → Networks and switch to your Ganache network ` +
            `(RPC: ${GANACHE_RPC_URL}, Chain ID: ${Number(GANACHE_CHAIN_ID)}).`
          );
        }
      }

      // After the switch, rebuild the provider and re-read the network.
      provider = new ethers.BrowserProvider(window.ethereum);
      const networkAfterSwitch = await provider.getNetwork();
      console.log("Chain ID after switch:", networkAfterSwitch.chainId.toString());

      if (networkAfterSwitch.chainId !== GANACHE_CHAIN_ID) {
        throw new Error(
          `Network switch did not succeed. ` +
          `MetaMask is now on Chain ID ${networkAfterSwitch.chainId}; expected ${GANACHE_CHAIN_ID}. ` +
          `Please switch to your Ganache network manually.`
        );
      }
    }

    signer = await provider.getSigner();
    currentAccount = await signer.getAddress();

    contract = new ethers.Contract(
      window.CONTRACT_ADDRESS,
      window.CONTRACT_ABI,
      signer
    );

    // Read the administrator from the deployed contract.
    const adminAddress = await contract.admin();

    isAdmin =
      adminAddress.toLowerCase() === currentAccount.toLowerCase();

    // Check whether this wallet is an authorized issuer.
    isAuthorizedIssuer = await contract.authorizedIssuers(
      currentAccount
    );

    updateWalletUI();

    showMessage(
      "MetaMask connected successfully!",
      "success"
    );

  } catch (error) {
    console.error("Wallet connection error:", error);

    showMessage(
      getErrorMessage(error),
      "error"
    );
  }
}

// Refresh wallet permissions without reloading the page.
async function refreshPermissions() {
  try {
    if (!contract || !currentAccount) {
      throw new Error("Connect your MetaMask wallet first.");
    }

    const adminAddress = await contract.admin();

    isAdmin =
      adminAddress.toLowerCase() === currentAccount.toLowerCase();

    isAuthorizedIssuer = await contract.authorizedIssuers(
      currentAccount
    );

    updateWalletUI();

    showMessage(
      "Wallet permissions refreshed.",
      "success"
    );

  } catch (error) {
    console.error("Permission refresh error:", error);
    showMessage(getErrorMessage(error), "error");
  }
}

// ============================================
// NAVIGATION
// ============================================

function showSection(viewName) {
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle(
      "active",
      view.id === `view-${viewName}`
    );
  });

  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.view === viewName
    );
  });

  const titles = {
    verify: {
      title: "Verify a certificate",
      subtitle:
        "Check a certificate's authenticity against the blockchain record."
    },
    issue: {
      title: "Issue a certificate",
      subtitle:
        "Register an academic certificate on the blockchain."
    },
    admin: {
      title: "Issuer management",
      subtitle:
        "Manage the wallets authorized to issue certificates."
    }
  };

  const page = titles[viewName];

  if (page) {
    const title = $("page-title");
    const subtitle = $("page-subtitle");

    if (title) title.textContent = page.title;
    if (subtitle) subtitle.textContent = page.subtitle;
  }
}

// ============================================
// ISSUE CERTIFICATE  (IPFS-enabled)
// ============================================

async function issueCertificate(event) {
  event.preventDefault();

  const submitBtn = event.target.querySelector("button[type='submit']");

  try {
    if (!contract || !currentAccount) {
      throw new Error("Connect your MetaMask wallet first.");
    }

    if (!isAdmin && !isAuthorizedIssuer) {
      throw new Error(
        "Your wallet is not authorized to issue certificates."
      );
    }

    const certificateId = $("issue-id", "issueCertificateId")
      ?.value.trim();

    const file = $("issue-file", "issueCertificateFile")
      ?.files[0];

    if (!certificateId) {
      throw new Error("Enter a certificate ID.");
    }

    if (!file) {
      throw new Error("Choose the certificate file.");
    }

    if (file.type !== "application/pdf") {
      throw new Error("Only PDF files are accepted.");
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new Error("The file must not exceed 20 MB.");
    }

    // Disable the button to prevent duplicate submissions.
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Processing…";
    }

    // ── Step 1: Calculate SHA-256 hash of the PDF ────────────────────
    showMessage("Calculating certificate hash…", "info");
    const certificateHash = await getFileHash(file);

    // ── Step 2: Upload PDF to IPFS via the Pinata backend ────────────
    showMessage("Uploading certificate to IPFS (Pinata)…", "info");

    const formData = new FormData();
    formData.append("file", file);

    let ipfsCID;
    try {
      const uploadResponse = await fetch(IPFS_BACKEND_URL, {
        method: "POST",
        body: formData
        // Do NOT set Content-Type manually — the browser sets the
        // multipart boundary automatically when body is FormData.
      });

      if (!uploadResponse.ok) {
        const errBody = await uploadResponse.json().catch(() => ({}));
        throw new Error(
          errBody.error || `IPFS backend returned HTTP ${uploadResponse.status}.`
        );
      }

      const uploadResult = await uploadResponse.json();

      if (!uploadResult.success || !uploadResult.cid) {
        throw new Error(
          "IPFS upload did not return a CID. Check the backend server."
        );
      }

      ipfsCID = uploadResult.cid;
      console.log("IPFS CID:", ipfsCID);

    } catch (uploadError) {
      // Re-throw with a clear message so the user knows it was the
      // IPFS step that failed, not the blockchain step.
      throw new Error(
        "IPFS upload failed — blockchain registration was NOT attempted. " +
        uploadError.message
      );
    }

    // ── Step 3: Register the certificate on the blockchain ───────────
    const certificateIdHash = getCertificateIdHash(certificateId);

    showMessage(
      "IPFS upload successful. Confirm the certificate registration in MetaMask.",
      "info"
    );

    const transaction = await contract.registerCertificate(
      certificateIdHash,
      certificateHash,
      ipfsCID
    );

    showMessage(
      "Transaction submitted. Waiting for blockchain confirmation…",
      "info"
    );

    await transaction.wait();

    // ── Step 4: Display result ───────────────────────────────────────
    const ipfsLink = `${IPFS_GATEWAY}${ipfsCID}`;

    displayIssueResult({
      certificateId,
      certificateHash,
      ipfsCID,
      ipfsLink,
      txHash: transaction.hash
    });

    $("issue-form", "issueForm")?.reset();

    updateFileName(
      $("issue-file", "issueCertificateFile"),
      $("issue-file-name")
    );

  } catch (error) {
    console.error("Issue certificate error:", error);
    showMessage(getErrorMessage(error), "error");
  } finally {
    // Re-enable the submit button regardless of success or failure.
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Register on blockchain →";
    }
  }
}

// Render a structured success panel after certificate registration.
function displayIssueResult({ certificateId, certificateHash, ipfsCID, ipfsLink, txHash }) {
  // Use the notice bar for a concise summary…
  showMessage(
    `Certificate registered successfully! IPFS CID: ${ipfsCID}`,
    "success"
  );

  // …and build a rich result panel below the form.
  let resultPanel = $("issue-result");
  if (!resultPanel) {
    resultPanel = document.createElement("div");
    resultPanel.id = "issue-result";
    resultPanel.className = "panel result-panel";
    const formPanel = document.querySelector("#view-issue .panel");
    if (formPanel) formPanel.after(resultPanel);
  }

  resultPanel.innerHTML = `
    <div class="result-header">
      <div class="result-symbol good">✓</div>
      <div>
        <h2 style="color:var(--green)">Certificate Registered</h2>
        <p>The certificate was uploaded to IPFS and registered on the blockchain.</p>
      </div>
    </div>
    <div class="result-list">
      <div class="result-item">
        <span>Certificate ID</span>
        <strong>${escapeHtml(certificateId)}</strong>
      </div>
      <div class="result-item">
        <span>SHA-256 Hash</span>
        <strong style="word-break:break-all;font-size:10px">${escapeHtml(certificateHash)}</strong>
      </div>
      <div class="result-item">
        <span>IPFS CID</span>
        <strong style="word-break:break-all;font-size:10px">${escapeHtml(ipfsCID)}</strong>
      </div>
      <div class="result-item">
        <span>Transaction</span>
        <strong style="word-break:break-all;font-size:10px">${escapeHtml(txHash)}</strong>
      </div>
    </div>
    <div style="margin-top:14px">
      <a href="${escapeHtml(ipfsLink)}" target="_blank" rel="noopener noreferrer"
         class="button button-secondary" style="display:inline-flex">
        View certificate on IPFS ↗
      </a>
    </div>
  `;

  resultPanel.className = "panel result-panel success";
  resultPanel.style.display = "block";
  resultPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ============================================
// VERIFY CERTIFICATE  (IPFS-enabled)
// ============================================

async function verifyCertificate(event) {
  event.preventDefault();

  const resultPanel = $("verify-result");

  try {
    if (!contract || !currentAccount) {
      throw new Error("Connect your MetaMask wallet first.");
    }

    const certificateId = $("verify-id", "verifyCertificateId")
      ?.value.trim();

    const file = $("verify-file", "verifyCertificateFile")
      ?.files[0];

    if (!certificateId) {
      throw new Error("Enter the certificate ID.");
    }

    if (!file) {
      throw new Error("Choose the certificate file to verify.");
    }

    const certificateIdHash =
      getCertificateIdHash(certificateId);

    const uploadedHash = await getFileHash(file);

    showMessage(
      "Checking the certificate against the blockchain…",
      "info"
    );

    const result = await contract.verifyCertificate(
      certificateIdHash,
      uploadedHash
    );

    // The updated contract returns 6 values:
    // [0] exists  [1] hashMatches  [2] revoked
    // [3] issuer  [4] issueDate    [5] ipfsCID
    const [
      exists,
      hashMatches,
      revoked,
      issuer,
      issueDate,
      ipfsCID
    ] = result;

    if (!exists) {
      displayVerificationResult(
        "Certificate Not Found",
        "No certificate with this ID is registered on the blockchain.",
        "error",
        null
      );
      return;
    }

    if (revoked) {
      displayVerificationResult(
        "Certificate Revoked",
        `This certificate has been revoked.
  Issuer: ${issuer}
  Issue date: ${formatDate(issueDate)}`,
        "error",
        null
      );
      return;
    }

    if (!hashMatches) {
      displayVerificationResult(
        "Certificate Invalid",
        "The uploaded file does not match the document registered on the blockchain.",
        "error",
        null
      );
      return;
    }

    displayVerificationResult(
      "Certificate Verified",
      "The certificate is valid and the uploaded file matches the registered record.",
      "success",
      {
        certificateId,
        issuer,
        issueDate,
        ipfsCID
      }
    );

    if (revoked) {
      displayVerificationResult(
        "Certificate Revoked",
        `This certificate has been revoked.\nIssuer: ${issuer}\nIssue date: ${formatDate(issueDate)}`,
        "error",
        null
      );
      return;
    }

    // Certificate exists, hash matches, and is not revoked → valid.
    displayVerificationResult(
      "Certificate Verified",
      `The certificate is valid and the uploaded file matches the registered record.`,
      "success",
      {
        certificateId,
        issuer,
        issueDate,
        ipfsCID
      }
    );

  } catch (error) {
    console.error("Certificate verification error:", error);

    showMessage(
      getErrorMessage(error),
      "error"
    );

    if (resultPanel) {
      resultPanel.classList.add("hidden");
    }
  }
}

function displayVerificationResult(title, message, type, details) {
  const resultPanel = $("verify-result");

  if (resultPanel) {
    const isSuccess = (type === "success");
    const symbolChar = isSuccess ? "✓" : "✕";
    const symbolClass = isSuccess ? "good" : "bad";

    let detailsHtml = "";
    if (isSuccess && details) {
      const ipfsLink = details.ipfsCID
        ? `${IPFS_GATEWAY}${details.ipfsCID}`
        : null;

      detailsHtml = `
        <div class="result-list" style="margin-top:16px">
          <div class="result-item">
            <span>Certificate ID</span>
            <strong>${escapeHtml(details.certificateId)}</strong>
          </div>
          <div class="result-item">
            <span>Issuer address</span>
            <strong style="font-size:10px;word-break:break-all">${escapeHtml(details.issuer)}</strong>
          </div>
          <div class="result-item">
            <span>Issue date</span>
            <strong>${escapeHtml(formatDate(details.issueDate))}</strong>
          </div>
          <div class="result-item">
            <span>IPFS CID</span>
            <strong style="font-size:10px;word-break:break-all">${escapeHtml(details.ipfsCID || "—")}</strong>
          </div>
        </div>
        ${ipfsLink ? `
        <div style="margin-top:14px">
          <a href="${escapeHtml(ipfsLink)}" target="_blank" rel="noopener noreferrer"
             class="button button-secondary" style="display:inline-flex">
            View original certificate on IPFS ↗
          </a>
        </div>` : ""}
      `;
    }

    resultPanel.innerHTML = `
      <div class="result-header">
        <div class="result-symbol ${symbolClass}">${symbolChar}</div>
        <div>
          <h2 style="color:${isSuccess ? "var(--green)" : "var(--red)"}">${escapeHtml(title)}</h2>
          <p style="white-space:pre-line">${escapeHtml(message)}</p>
        </div>
      </div>
      ${detailsHtml}
    `;

    resultPanel.className = `panel result-panel ${type}`;
    resultPanel.classList.remove("hidden");
    resultPanel.style.display = "block";
    resultPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  showMessage(`${title}: ${message}`, type);
}

// ============================================
// AUTHORIZE ISSUER
// ============================================

async function authorizeIssuer(event) {
  event.preventDefault();

  try {
    if (!contract || !currentAccount) {
      throw new Error("Connect your MetaMask wallet first.");
    }

    if (!isAdmin) {
      throw new Error(
        "Only the administrator can authorize issuers."
      );
    }

    const issuerAddress = $("issuer-address", "issuerAddress")
      ?.value.trim();

    if (!issuerAddress || !ethers.isAddress(issuerAddress)) {
      throw new Error("Enter a valid Ethereum wallet address.");
    }

    showMessage(
      "Confirm the issuer authorization in MetaMask.",
      "info"
    );

    const transaction = await contract.authorizeIssuer(
      issuerAddress
    );

    showMessage(
      "Transaction submitted. Waiting for confirmation…",
      "info"
    );

    await transaction.wait();

    showMessage(
      `Issuer authorized successfully: ${issuerAddress}`,
      "success"
    );

    $("issuer-form", "issuerForm")?.reset();

    await refreshPermissionsAfterTransaction();

  } catch (error) {
    console.error("Authorize issuer error:", error);
    showMessage(getErrorMessage(error), "error");
  }
}

// ============================================
// REMOVE ISSUER
// ============================================

async function removeIssuer(event) {
  if (event) event.preventDefault();

  try {
    if (!contract || !currentAccount) {
      throw new Error("Connect your MetaMask wallet first.");
    }

    if (!isAdmin) {
      throw new Error(
        "Only the administrator can remove issuers."
      );
    }

    const issuerAddress = $("issuer-address", "issuerAddress")
      ?.value.trim();

    if (!issuerAddress || !ethers.isAddress(issuerAddress)) {
      throw new Error("Enter a valid Ethereum wallet address.");
    }

    if (
      issuerAddress.toLowerCase() === currentAccount.toLowerCase()
    ) {
      throw new Error(
        "You cannot remove the administrator account."
      );
    }

    showMessage(
      "Confirm the issuer removal in MetaMask.",
      "info"
    );

    const transaction = await contract.removeIssuer(
      issuerAddress
    );

    showMessage(
      "Transaction submitted. Waiting for confirmation…",
      "info"
    );

    await transaction.wait();

    showMessage(
      `Issuer removed successfully: ${issuerAddress}`,
      "success"
    );

    $("issuer-form", "issuerForm")?.reset();

    await refreshPermissionsAfterTransaction();

  } catch (error) {
    console.error("Remove issuer error:", error);
    showMessage(getErrorMessage(error), "error");
  }
}

async function refreshPermissionsAfterTransaction() {
  if (!contract || !currentAccount) return;

  const adminAddress = await contract.admin();

  isAdmin =
    adminAddress.toLowerCase() === currentAccount.toLowerCase();

  isAuthorizedIssuer = await contract.authorizedIssuers(
    currentAccount
  );

  updateWalletUI();
}

// ============================================
// FILE INPUT DISPLAY
// ============================================

function updateFileName(fileInput, nameElement) {
  if (!fileInput || !nameElement) return;

  nameElement.textContent = fileInput.files?.[0]
    ? fileInput.files[0].name
    : "Choose a certificate file";
}

// ============================================
// DATE, ERROR, AND UTILITY HELPERS
// ============================================

function formatDate(timestamp) {
  const date = new Date(Number(timestamp) * 1000);

  return date.toLocaleString();
}

// Escape HTML special characters to prevent XSS when injecting
// user-controlled or on-chain data into innerHTML.
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getErrorMessage(error) {
  if (error?.code === 4001 || error?.code === "ACTION_REJECTED") {
    return "The transaction or wallet connection was rejected in MetaMask.";
  }

  if (error?.code === "INSUFFICIENT_FUNDS") {
    return "The wallet does not have enough funds for this transaction.";
  }

  if (error?.reason) {
    return error.reason;
  }

  if (error?.shortMessage) {
    return error.shortMessage;
  }

  const message = error?.message || "";

  if (message.includes("already registered")) {
    return "This certificate ID may already be registered.";
  }

  if (message.includes("user rejected")) {
    return "The request was rejected in MetaMask.";
  }

  if (message.includes("could not decode result data")) {
    return "Could not read the contract. Check the contract address and ABI in config.js.";
  }

  if (message.includes("IPFS upload failed")) {
    return message;
  }

  return message || "An unexpected error occurred. Check the browser console.";
}

// ============================================
// INITIALIZE THE APPLICATION
// ============================================

document.addEventListener("DOMContentLoaded", () => {
  // Connect wallet button
  $("connect-wallet", "connectWallet")
    ?.addEventListener("click", connectWallet);

  // Navigation buttons
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      showSection(button.dataset.view);
    });
  });

  // Certificate forms
  $("verify-form", "verifyForm")
    ?.addEventListener("submit", verifyCertificate);

  $("issue-form", "issueForm")
    ?.addEventListener("submit", issueCertificate);

  // Issuer management form
  $("issuer-form", "issuerForm")
    ?.addEventListener("submit", authorizeIssuer);

  // Remove issuer button
  $("remove-issuer", "removeIssuer")
    ?.addEventListener("click", removeIssuer);

  // Refresh permissions button
  $("refresh-role", "refreshRole")
    ?.addEventListener("click", refreshPermissions);

  // File name updates
  $("verify-file", "verifyCertificateFile")
    ?.addEventListener("change", () => {
      updateFileName(
        $("verify-file", "verifyCertificateFile"),
        $("verify-file-name")
      );
    });

  $("issue-file", "issueCertificateFile")
    ?.addEventListener("change", () => {
      updateFileName(
        $("issue-file", "issueCertificateFile"),
        $("issue-file-name")
      );
    });

  // Disable browser's native validation for hidden file inputs.
  // The JavaScript functions validate required fields themselves.
  $("verify-form", "verifyForm")?.setAttribute("novalidate", "");
  $("issue-form", "issueForm")?.setAttribute("novalidate", "");
  $("issuer-form", "issuerForm")?.setAttribute("novalidate", "");

  // Listen for MetaMask account and network changes.
  if (window.ethereum) {
    window.ethereum.on("accountsChanged", () => {
      window.location.reload();
    });

    window.ethereum.on("chainChanged", () => {
      window.location.reload();
    });
  }

  // Set the initial interface.
  updateWalletUI();
  showSection("verify");

  console.log("CertiChain app.js loaded successfully. IPFS integration active.");
});
