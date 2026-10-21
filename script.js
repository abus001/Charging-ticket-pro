// =============================================
// CHARGE TICKET PRO
// Firebase + Authentication + Firestore
// =============================================

import { initializeApp } from
  "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from
  "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  runTransaction
} from
  "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";


// =============================================
// 1. FIREBASE CONFIGURATION
// =============================================

const firebaseConfig = {
  apiKey: "AIzaSyAP7HgtAyYNZ_8Ngb43ml0WG6DZZhlgVzY",
  authDomain: "charging-ticket-pro.firebaseapp.com",
  databaseURL: "https://charging-ticket-pro-default-rtdb.firebaseio.com",
  projectId: "charging-ticket-pro",
  storageBucket: "charging-ticket-pro.firebasestorage.app",
  messagingSenderId: "966266089387",
  appId: "1:966266089387:web:f923de72ddef7ed901acee",
  measurementId: "G-80F542JVFB"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);


// =============================================
// 2. HELPER FUNCTIONS
// =============================================

const $ = id => document.getElementById(id);

function showMessage(message, type = "info") {
  const box = $("authMessage");

  if (box) {
    box.textContent = message;
    box.dataset.type = type;
  } else {
    alert(message);
  }
}

function ticketMessage(message) {
  const box = $("ticketResult");

  if (box) {
    box.textContent = message;
  } else {
    alert(message);
  }
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function getInput(id) {
  return $(id)?.value?.trim() || "";
}

function getLocalDate() {
  const now = new Date();

  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = String(now.getFullYear()).slice(-2);

  return `${day}.${month}.${year}`;
}

function getDateKey() {
  const now = new Date();

  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");
}

function showSection(id, visible) {
  const element = $(id);

  if (element) {
    element.hidden = !visible;
  }
}


// =============================================
// 3. APPLICATION STATE
// =============================================

let currentUser = null;
let currentProfile = null;
let currentShop = null;
let ticketCache = [];


// =============================================
// 4. LOGIN / REGISTER TABS
// =============================================

function showLoginTab() {
  showSection("loginForm", true);
  showSection("registerForm", false);
}

function showRegisterTab() {
  showSection("loginForm", false);
  showSection("registerForm", true);
}

$("loginTab")?.addEventListener("click", showLoginTab);
$("registerTab")?.addEventListener("click", showRegisterTab);


// =============================================
// 5. SHOP REGISTRATION
// =============================================

$("registerForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  const ownerName = getInput("ownerName");
  const shopName = getInput("shopName");
  const shopPrefix = getInput("shopPrefix").toUpperCase();
  const ownerPhone = getInput("ownerPhone");
  const shopAddress = getInput("shopAddress");
  const email = getInput("registerEmail").toLowerCase();
  const password = getInput("registerPassword");

  if (
    !ownerName ||
    !shopName ||
    !shopPrefix ||
    !ownerPhone ||
    !shopAddress ||
    !email ||
    !password
  ) {
    showMessage("Da fitar da dukkan bayanan da ake bukata.", "error");
    return;
  }

  if (!/^[A-Z0-9]{2,8}$/.test(shopPrefix)) {
    showMessage(
      "Shop Prefix ya kasance haruffa ko lambobi 2 zuwa 8.",
      "error"
    );
    return;
  }

  if (password.length < 6) {
    showMessage("Password dole ya kasance aƙalla haruffa 6.", "error");
    return;
  }

  try {
    showMessage("Ana ƙirƙirar account ɗinka...");

    const credential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );

    const uid = credential.user.uid;

    // User profile starts as pending shop admin.
    await setDoc(doc(db, "users", uid), {
      uid,
      ownerName,
      email,
      role: "shopAdmin",
      shopId: uid,
      status: "pending",
      createdAt: serverTimestamp()
    });

    // Shop application.
    await setDoc(doc(db, "shops", uid), {
      shopId: uid,
      shopName,
      shopPrefix,
      ownerName,
      ownerPhone,
      shopAddress,
      ownerUid: uid,
      status: "pending",
      subscriptionStatus: "inactive",
      subscriptionExpiresAt: null,
      ticketNumberMode: "daily",
      createdAt: serverTimestamp()
    });

    showMessage(
      "An karɓi rajistar shagonka. Yana jiran amincewar Super Admin.",
      "success"
    );

    await loadApplication();

  } catch (error) {
    console.error("Registration error:", error);

    const messages = {
      "auth/email-already-in-use":
        "An riga an yi amfani da wannan email.",
      "auth/invalid-email":
        "Email ɗin ba daidai ba ne.",
      "auth/weak-password":
        "Password ɗin bai da ƙarfi sosai.",
      "permission-denied":
        "Firebase Rules sun hana wannan aiki. Duba Firestore Security Rules."
    };

    showMessage(
      messages[error.code] ||
      "An samu matsala yayin rajista: " + error.message,
      "error"
    );
  }
});


// =============================================
// 6. LOGIN
// =============================================

$("loginForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  const email = getInput("loginEmail").toLowerCase();
  const password = getInput("loginPassword");

  if (!email || !password) {
    showMessage("Shigar da email da password.", "error");
    return;
  }

  try {
    showMessage("Ana shiga account...");

    await signInWithEmailAndPassword(auth, email, password);

  } catch (error) {
    console.error("Login error:", error);

    const messages = {
      "auth/invalid-credential":
        "Email ko password ba daidai ba ne.",
      "auth/user-not-found":
        "Ba a sami account ɗin ba.",
      "auth/too-many-requests":
        "An yi ƙoƙarin shiga sau da yawa. Ka jira ka sake gwadawa."
    };

    showMessage(
      messages[error.code] || "An kasa shiga: " + error.message,
      "error"
    );
  }
});


// =============================================
// 7. AUTHENTICATION STATE
// =============================================

onAuthStateChanged(auth, async user => {
  currentUser = user;

  if (!user) {
    currentProfile = null;
    currentShop = null;

    showSection("dashboardSection", false);
    showSection("loginForm", true);
    showSection("registerForm", false);

    return;
  }

  await loadApplication();
});


// =============================================
// 8. LOAD USER AND SHOP
// =============================================

async function loadApplication() {
  if (!auth.currentUser) return;

  try {
    const uid = auth.currentUser.uid;

    const profileSnapshot = await getDoc(
      doc(db, "users", uid)
    );

    if (!profileSnapshot.exists()) {
      showSection("dashboardSection", false);

      showMessage(
        "Ba a sami user profile ba. Tuntuɓi Super Admin.",
        "error"
      );

      return;
    }

    currentProfile = profileSnapshot.data();

    if (currentProfile.role === "superAdmin") {
      showSection("dashboardSection", false);

      showMessage(
        "Super Admin account ya shiga. Za mu gina Admin Dashboard a mataki na gaba.",
        "success"
      );

      return;
    }

    const shopId = currentProfile.shopId;

    if (!shopId) {
      showMessage("Account ɗin ba shi da Shop ID.", "error");
      return;
    }

    const shopSnapshot = await getDoc(
      doc(db, "shops", shopId)
    );

    if (!shopSnapshot.exists()) {
      showMessage("Ba a sami bayanan shagon ba.", "error");
      return;
    }

    currentShop = shopSnapshot.data();

    showSection("loginForm", false);
    showSection("registerForm", false);
    showSection("dashboardSection", true);

    if ($("dashboardShopName")) {
      $("dashboardShopName").textContent =
        currentShop.shopName || "My Shop";
    }

    if ($("dashboardWelcome")) {
      $("dashboardWelcome").textContent =
        "Barka da zuwa, " + (currentProfile.ownerName || "Shop Owner");
    }

    const notice = $("accountNotice");

    if (notice) {
      if (currentShop.status !== "approved") {
        notice.textContent =
          "ACCOUNT PENDING: Shagonka yana jiran amincewar Super Admin.";
        notice.hidden = false;
      } else if (
        !currentShop.subscriptionExpiresAt ||
        currentShop.subscriptionStatus !== "active"
      ) {
        notice.textContent =
          "SUBSCRIPTION INACTIVE: Sabunta biyan kuɗin ₦5,000 domin amfani da PRO features.";
        notice.hidden = false;
      } else {
        notice.textContent = "";
        notice.hidden = true;
      }
    }

    const approved =
      currentShop.status === "approved" &&
      currentProfile.status === "approved";

    const subscriptionActive =
      currentShop.subscriptionStatus === "active" &&
      currentShop.subscriptionExpiresAt &&
      currentShop.subscriptionExpiresAt.toDate &&
      currentShop.subscriptionExpiresAt.toDate().getTime() > Date.now();

    const canOperate = approved && subscriptionActive;

    if ($("newTicketBtn")) {
      $("newTicketBtn").disabled = !canOperate;
    }

    if ($("viewTicketsBtn")) {
      $("viewTicketsBtn").disabled = !approved;
    }

    await refreshTickets();

  } catch (error) {
    console.error("Application load error:", error);

    showMessage(
      "An kasa ɗauko bayanan account. Duba Firebase Security Rules.",
      "error"
    );
  }
}


// =============================================
// 9. LOGOUT
// =============================================

$("logoutBtn")?.addEventListener("click", async () => {
  try {
    await signOut(auth);
    showMessage("Ka fita daga account.", "success");
  } catch (error) {
    showMessage("An kasa fita: " + error.message, "error");
  }
});


// =============================================
// 10. CHECK PERMISSIONS BEFORE OPERATIONS
// =============================================

function hasApprovedShop() {
  return Boolean(
    currentUser &&
    currentProfile &&
    currentShop &&
    currentProfile.role === "shopAdmin" &&
    currentProfile.status === "approved" &&
    currentShop.ownerUid === currentUser.uid &&
    currentShop.status === "approved"
  );
}

function hasActiveSubscription() {
  if (!hasApprovedShop()) return false;

  const expiry = currentShop.subscriptionExpiresAt;

  if (!expiry || typeof expiry.toDate !== "function") {
    return false;
  }

  return (
    currentShop.subscriptionStatus === "active" &&
    expiry.toDate().getTime() > Date.now()
  );
}


// =============================================
// 11. NEW TICKET
// =============================================

$("ticketForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  if (!hasActiveSubscription()) {
    ticketMessage(
      "Ba za ka iya ƙirƙirar ticket ba. Ana bukatar amincewar shago da subscription mai aiki."
    );
    return;
  }

  const itemName = getInput("itemName");
  const itemType = getInput("itemType");
  const cardNumberText = getInput("cardNumber");
  const itemColour = getInput("itemColour");
  const customerName = getInput("customerName");
  const customerPhone = getInput("customerPhone");
  const itemCondition = getInput("itemCondition");

  const cardNumber = Number(cardNumberText);

  if (!itemName || !itemType || !cardNumberText) {
    ticketMessage("Shigar da sunan kaya, nau'in kaya, da card number.");
    return;
  }

  if (
    !Number.isInteger(cardNumber) ||
    cardNumber < 1 ||
    cardNumber > 2000
  ) {
    ticketMessage("Card Number dole ya kasance tsakanin 1 da 2000.");
    return;
  }

  try {
    ticketMessage("Ana ƙirƙirar ticket...");

    const shopId = currentShop.shopId;
    const dateKey = getDateKey();

    // Generate a unique ticket sequence inside a transaction.
    const counterId =
      currentShop.ticketNumberMode === "continuous"
        ? "continuous"
        : dateKey;

    const counterRef = doc(
      db,
      "shops",
      shopId,
      "counters",
      counterId
    );

    const ticketNumber = await runTransaction(db, async transaction => {
      const counterSnapshot = await transaction.get(counterRef);

      const nextNumber = counterSnapshot.exists()
        ? Number(counterSnapshot.data().lastNumber || 0) + 1
        : 1;

      transaction.set(counterRef, {
        lastNumber: nextNumber,
        updatedAt: serverTimestamp()
      });

      return nextNumber;
    });

    const ticketId =
      `${currentShop.shopPrefix}/${getLocalDate()}/` +
      String(ticketNumber).padStart(3, "0");

    const ticketData = {
      ticketId,
      shopId,
      ticketNumber,
      dateKey,
      cardNumber,
      itemName,
      itemType,
      itemColour,
      itemCondition,
      customerName,
      customerPhone,
      status: "CHARGING",
      createdBy: currentUser.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    await addDoc(
      collection(db, "shops", shopId, "tickets"),
      ticketData
    );

    ticketMessage("An ƙirƙiri ticket: " + ticketId);

    $("ticketForm")?.reset();

    await refreshTickets();

  } catch (error) {
    console.error("Ticket creation error:", error);

    ticketMessage(
      "An kasa ƙirƙirar ticket: " + error.message
    );
  }
});


// =============================================
// 12. LOAD TICKETS
// =============================================

async function refreshTickets() {
  if (!currentShop || !currentProfile) return;

  if (
    currentProfile.status !== "approved" ||
    currentShop.status !== "approved"
  ) {
    ticketCache = [];
    updateDashboardStats();
    renderTickets();
    return;
  }

  try {
    const ticketsRef = collection(
      db,
      "shops",
      currentShop.shopId,
      "tickets"
    );

    const ticketQuery = query(
      ticketsRef,
      orderBy("createdAt", "desc"),
      limit(500)
    );

    const snapshot = await getDocs(ticketQuery);

    ticketCache = snapshot.docs.map(ticketDoc => ({
      id: ticketDoc.id,
      ...ticketDoc.data()
    }));

    updateDashboardStats();
    renderTickets();

  } catch (error) {
    console.error("Ticket loading error:", error);

    ticketMessage(
      "An kasa ɗauko tickets. Duba Firestore Rules da indexes."
    );
  }
}


// =============================================
// 13. DASHBOARD STATISTICS
// =============================================

function updateDashboardStats() {
  const total = ticketCache.length;

  const charging = ticketCache.filter(
    ticket => ticket.status === "CHARGING"
  ).length;

  const ready = ticketCache.filter(
    ticket => ticket.status === "READY"
  ).length;

  const pending = ticketCache.filter(
    ticket => ticket.status === "NOT COLLECTED"
  ).length;

  if ($("totalTickets")) {
    $("totalTickets").textContent = total;
  }

  if ($("chargingTickets")) {
    $("chargingTickets").textContent = charging;
  }

  if ($("readyTickets")) {
    $("readyTickets").textContent = ready;
  }

  if ($("pendingTickets")) {
    $("pendingTickets").textContent = pending;
  }
}


// =============================================
// 14. SEARCH AND FILTER TICKETS
// =============================================

$("ticketSearch")?.addEventListener("input", renderTickets);
$("statusFilter")?.addEventListener("change", renderTickets);

function renderTickets() {
  const container = $("ticketsList");

  if (!container) return;

  const search = getInput("ticketSearch").toLowerCase();

  const statusFilter = getInput("statusFilter") || "ALL";

  const results = ticketCache.filter(ticket => {
    const searchable = [
      ticket.ticketId,
      ticket.cardNumber,
      ticket.itemName,
      ticket.itemType,
      ticket.customerName,
      ticket.customerPhone
    ].join(" ").toLowerCase();

    const matchesSearch = searchable.includes(search);

    const matchesStatus =
      statusFilter === "ALL" ||
      ticket.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  if (!results.length) {
    container.innerHTML =
      '<p class="empty-state">Ba a sami ticket da ya dace ba.</p>';
    return;
  }

  container.innerHTML = results.map(ticket => `
    <article class="ticket-card">
      <div class="ticket-card-header">
        <h3>${escapeHTML(ticket.ticketId)}</h3>
        <span class="status-badge">
          ${escapeHTML(ticket.status)}
        </span>
      </div>

      <p><strong>Kaya:</strong> ${escapeHTML(ticket.itemName)}</p>
      <p><strong>Nau'i:</strong> ${escapeHTML(ticket.itemType)}</p>
      <p><strong>Card Number:</strong> ${escapeHTML(ticket.cardNumber)}</p>
      <p><strong>Launi:</strong> ${escapeHTML(ticket.itemColour || "-")}</p>
      <p><strong>Customer:</strong> ${escapeHTML(ticket.customerName || "-")}</p>
      <p><strong>Phone:</strong> ${escapeHTML(ticket.customerPhone || "-")}</p>

      <div class="ticket-actions">
        <button
          type="button"
          data-ticket-action="READY"
          data-ticket-id="${escapeHTML(ticket.id)}">
          Ready
        </button>

        <button
          type="button"
          data-ticket-action="NOT COLLECTED"
          data-ticket-id="${escapeHTML(ticket.id)}">
          Not Collected
        </button>

        <button
          type="button"
          data-ticket-action="RETURNED"
          data-ticket-id="${escapeHTML(ticket.id)}">
          Returned
        </button>

        <button
          type="button"
          data-ticket-action="print"
          data-ticket-id="${escapeHTML(ticket.id)}">
          Print
        </button>
      </div>
    </article>
  `).join("");
}


// =============================================
// 15. UPDATE TICKET STATUS
// =============================================

document.addEventListener("click", async event => {
  const button = event.target.closest("[data-ticket-action]");

  if (!button) return;

  const action = button.dataset.ticketAction;
  const ticketId = button.dataset.ticketId;

  const ticket = ticketCache.find(
    item => item.id === ticketId
  );

  if (!ticket) {
    alert("Ba a sami ticket ɗin ba.");
    return;
  }

  if (action === "print") {
    printTicket(ticket);
    return;
  }

  if (!hasActiveSubscription()) {
    alert("Shagonka yana bukatar subscription mai aiki.");
    return;
  }

  const validStatuses = [
    "READY",
    "NOT COLLECTED",
    "RETURNED"
  ];

  if (!validStatuses.includes(action)) return;

  try {
    const ticketRef = doc(
      db,
      "shops",
      currentShop.shopId,
      "tickets",
      ticketId
    );

    await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(ticketRef);

      if (!snapshot.exists()) {
        throw new Error("Ticket ɗin ba ya nan.");
      }

      transaction.update(ticketRef, {
        status: action,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid
      });
    });

    await refreshTickets();

  } catch (error) {
    console.error("Status update error:", error);

    alert("An kasa canza status: " + error.message);
  }
});


// =============================================
// 16. PRINT TICKET RECEIPT
// =============================================

function printTicket(ticket) {
  const receiptWindow = window.open(
    "",
    "_blank",
    "width=420,height=650"
  );

  if (!receiptWindow) {
    alert("Ka ba browser izinin buɗe print window.");
    return;
  }

  receiptWindow.document.write(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Charging Ticket</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          padding: 20px;
          color: #111;
        }
        .receipt {
          max-width: 320px;
          margin: auto;
          border: 2px dashed #555;
          padding: 18px;
        }
        h2 { text-align: center; }
        .ticket-id {
          font-size: 20px;
          font-weight: bold;
          text-align: center;
          overflow-wrap: anywhere;
        }
        .line {
          border-top: 1px dashed #777;
          margin: 14px 0;
        }
        p { font-size: 14px; }
        .footer {
          text-align: center;
          margin-top: 20px;
        }
        @media print {
          button { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="receipt">
        <h2>${escapeHTML(currentShop.shopName)}</h2>
        <p class="ticket-id">${escapeHTML(ticket.ticketId)}</p>
        <div class="line"></div>
        <p><strong>Card:</strong> ${escapeHTML(ticket.cardNumber)}</p>
        <p><strong>Item:</strong> ${escapeHTML(ticket.itemName)}</p>
        <p><strong>Type:</strong> ${escapeHTML(ticket.itemType)}</p>
        <p><strong>Colour:</strong> ${escapeHTML(ticket.itemColour || "-")}</p>
        <p><strong>Condition:</strong> ${escapeHTML(ticket.itemCondition || "-")}</p>
        <p><strong>Customer:</strong> ${escapeHTML(ticket.customerName || "-")}</p>
        <p><strong>Phone:</strong> ${escapeHTML(ticket.customerPhone || "-")}</p>
        <p><strong>Status:</strong> ${escapeHTML(ticket.status)}</p>
        <div class="line"></div>
        <p class="footer">Thank you for your patronage.</p>
        <button onclick="window.print()">Print Ticket</button>
      </div>
    </body>
    </html>
  `);

  receiptWindow.document.close();
  receiptWindow.focus();
}


// =============================================
// 17. DASHBOARD BUTTONS
// =============================================

$("newTicketBtn")?.addEventListener("click", () => {
  if (!hasActiveSubscription()) {
    alert(
      "Ana bukatar Super Admin ya amince da shagonka kuma subscription ɗinka ya kasance active."
    );
    return;
  }

  showSection("ticketFormPanel", true);
  showSection("ticketsPanel", false);
});

$("viewTicketsBtn")?.addEventListener("click", async () => {
  if (!hasApprovedShop()) {
    alert("Shagonka yana jiran amincewar Super Admin.");
    return;
  }

  showSection("ticketFormPanel", false);
  showSection("ticketsPanel", true);

  await refreshTickets();
});


// =============================================
// 18. INITIAL PAGE STATE
// =============================================

showSection("dashboardSection", false);

console.log("CHARGE TICKET PRO script loaded.");
