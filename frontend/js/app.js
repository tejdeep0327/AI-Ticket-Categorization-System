const API_URL = "http://localhost:5001";
let dashboardTickets = [];

function applyTheme(theme) {
  const selected = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", selected);
  localStorage.setItem("setting_theme", selected);
}

window.applyTheme = applyTheme;

/* ===============================
   INIT
================================*/
document.addEventListener("DOMContentLoaded", () => {
  const savedTheme = localStorage.getItem("setting_theme") || "light";
  document.documentElement.setAttribute("data-theme", savedTheme);
  setupAboutPopup();
  setupPrivacyPolicyPopup();
  setupCreateTicket();
  setupHistory();
  setupDashboard();
});

document.addEventListener("click", (e) => {
  const toggle = e.target.closest(".auth-menu-toggle");
  if (toggle) {
    const menu = toggle.closest(".auth-menu");
    document.querySelectorAll(".auth-menu.open").forEach(m => {
      if (m !== menu) m.classList.remove("open");
    });
    if (menu) menu.classList.toggle("open");
    return;
  }

  const logoutBtn = e.target.closest(".auth-logout-btn");
  if (logoutBtn) {
    e.preventDefault();
    logout();
    return;
  }

  if (!e.target.closest(".auth-menu")) {
    document.querySelectorAll(".auth-menu.open").forEach(m => m.classList.remove("open"));
  }
});


/* ===============================
   CREATE TICKET
================================*/
function setupCreateTicket() {

  const form = document.getElementById("ticketForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const user = JSON.parse(localStorage.getItem("user"));
    if (!user) {
      showAlert("Please login first", "error");
      return;
    }

    const title = document.getElementById("title").value.trim();
    const description = document.getElementById("description").value.trim();

    const submitBtn = document.getElementById("submitBtn");
    const btnText = document.getElementById("btnText");
    const resultBox = document.getElementById("resultBox");
    const alertContainer = document.getElementById("alertContainer");

    submitBtn.disabled = true;
    btnText.innerHTML = `<span class="loading"></span> Processing...`;
    if (resultBox) resultBox.style.display = "none";
    alertContainer.innerHTML = "";

    try {
      const response = await fetch(`${API_URL}/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          user_id: user.id
        })
      });

      const result = await response.json();

      if (!response.ok) throw new Error(result.error || "Failed to create ticket");

      if (resultBox) {
        resultBox.innerHTML = `
          <h3>✓ Ticket Created Successfully!</h3>
          <div class="result-item"><span class="result-label">Ticket ID:</span><span class="result-value">${formatTicketId(result.ticket_id || result.id)}</span></div>
          <div class="result-item"><span class="result-label">Category:</span><span class="result-value">${result.category}</span></div>
          <div class="result-item"><span class="result-label">Priority:</span><span class="result-value">${result.priority}</span></div>
          <div class="result-item"><span class="result-label">Confidence:</span><span class="result-value">${formatConfidence(result.confidence)}</span></div>
        `;
        resultBox.style.display = "block";
      }

      form.reset();

      // show success popup
      showToast("Ticket created successfully");
      
      // redirect after short delay
      setTimeout(()=>{
        window.location.href = "dashboard.html";
      }, 1200);
      
      

    } catch (error) {
      console.error(error);
      showAlert(error.message || "Server not running", "error");
    } finally {
      submitBtn.disabled = false;
      btnText.textContent = "Submit Ticket";
    }
  });
}


/* ===============================
   HISTORY PAGE
================================*/
function setupHistory() {
  const container = document.getElementById("ticketsBody");
  if (!container || !document.querySelector(".history-table")) return;
  loadTickets();
}

async function loadTickets() {

  const container = document.getElementById("ticketsBody");
  const user = JSON.parse(localStorage.getItem("user"));
  if (!user) return;

  container.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:28px;">Loading activity...</td></tr>`;

  try {
    const response = await fetch(`${API_URL}/tickets/${user.id}`);
    const tickets = await response.json();

    if (!tickets.length) {
      container.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:28px;">No ticket activity found</td></tr>`;
      return;
    }

    tickets.sort((a,b)=> new Date(b.created_at) - new Date(a.created_at));

    container.innerHTML = tickets.map(ticket => `
      <tr class="history-table-row">
        <td>${formatTicketId(ticket.id)}</td>
        <td class="history-title-cell" title="${escapeHTML(ticket.title)}">${truncateText(ticket.title, 52)}</td>
        <td>${escapeHTML(ticket.category || "--")}</td>
        <td>${escapeHTML(ticket.priority || "--")}</td>
        <td>
          <span class="confidence-pill ${getConfidenceClass(ticket.confidence)}">
            ${formatConfidence(ticket.confidence)}
          </span>
        </td>
        <td><span class="status ${getStatusClass(ticket.status)}">${escapeHTML(ticket.status || "--")}</span></td>
        <td>${formatDate(ticket.created_at)}</td>
      </tr>
    `).join("");

  } catch {
    container.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:28px;">Server error</td></tr>`;
  }
}


/* ===============================
   DASHBOARD TABLE
================================*/
function setupDashboard(){
  const table = document.getElementById("ticketsBody");
  if (!table || !document.querySelector(".ticket-table")) return;

  const searchInput = document.getElementById("ticketSearch");
  const statusFilter = document.getElementById("statusFilter");
  const categoryFilter = document.getElementById("categoryFilter");
  const priorityFilter = document.getElementById("priorityFilter");
  const sortFilter = document.getElementById("sortFilter");
  const clearBtn = document.getElementById("clearFilters");
  const preferredSort = localStorage.getItem("setting_default_sort") || "recent";

  if (searchInput) searchInput.addEventListener("input", renderDashboardView);
  if (statusFilter) statusFilter.addEventListener("change", renderDashboardView);
  if (categoryFilter) categoryFilter.addEventListener("change", renderDashboardView);
  if (priorityFilter) priorityFilter.addEventListener("change", renderDashboardView);
  if (sortFilter) sortFilter.addEventListener("change", renderDashboardView);
  if (sortFilter) sortFilter.value = preferredSort;
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      if (statusFilter) statusFilter.value = "";
      if (categoryFilter) categoryFilter.value = "";
      if (priorityFilter) priorityFilter.value = "";
      if (sortFilter) sortFilter.value = preferredSort;
      renderDashboardView();
    });
  }

  loadDashboard();
}

async function loadDashboard(){

  const table = document.getElementById("ticketsBody");
  const user = JSON.parse(localStorage.getItem("user"));
  if (!user) return;

  try{
    const res = await fetch(`${API_URL}/tickets/${user.id}`);
    const tickets = await res.json();
    dashboardTickets = Array.isArray(tickets) ? tickets : [];

    renderDashboardView();

  }catch{
    table.innerHTML=`<tr><td colspan="7">Server error</td></tr>`;
  }
}

function renderDashboardView() {
  const table = document.getElementById("ticketsBody");
  if (!table) return;

  const filteredTickets = getFilteredDashboardTickets(dashboardTickets);
  updateDashboardStats(dashboardTickets, filteredTickets);
  updateDashboardMeta(filteredTickets.length, dashboardTickets.length);

  if (!filteredTickets.length) {
    table.innerHTML = `<tr><td colspan="7">No matching tickets found</td></tr>`;
    return;
  }

  table.innerHTML = filteredTickets.map(t=>`
    <tr class="ticket-row" onclick='openModal(${JSON.stringify(t)})'>
      <td><span class="ticket-id">${formatTicketId(t.id)}</span></td>
      <td>
        <div class="ticket-cell">
          <div class="ticket-title">${escapeHTML(t.title || "--")}</div>
          <div class="ticket-subline">
            <span class="category-text ${getCategoryClass(t.category)}">${escapeHTML(t.category || "--")}</span>
            <span>${truncateText(t.description || "", 58)}</span>
          </div>
        </div>
      </td>
      <td><span class="priority-badge ${String(t.priority || "").toLowerCase()}">${escapeHTML(t.priority || "--")}</span></td>
      <td>
        <span class="confidence-pill ${getConfidenceClass(t.confidence)}">
          ${formatConfidence(t.confidence)}
        </span>
      </td>
      <td><span class="status ${getStatusClass(t.status)}">${escapeHTML(t.status || "--")}</span></td>
      <td>${formatDate(t.created_at)}</td>
      <td>
        <button class="resolve-btn ${String(t.status || "").toLowerCase() === "resolved" ? "done" : ""}" onclick="event.stopPropagation();resolveTicket(${t.id})" ${String(t.status || "").toLowerCase() === "resolved" ? "disabled" : ""}>
          ${String(t.status || "").toLowerCase() === "resolved" ? "Resolved" : "Resolve"}
        </button>
      </td>
    </tr>
  `).join("");
}

function getFilteredDashboardTickets(tickets) {
  const searchValue = (document.getElementById("ticketSearch")?.value || "").trim().toLowerCase();
  const statusValue = (document.getElementById("statusFilter")?.value || "").toLowerCase();
  const categoryValue = (document.getElementById("categoryFilter")?.value || "").toLowerCase();
  const priorityValue = (document.getElementById("priorityFilter")?.value || "").toLowerCase();
  const sortValue = (document.getElementById("sortFilter")?.value || "recent").toLowerCase();

  const filtered = tickets.filter(t => {
    const status = String(t.status || "").toLowerCase();
    const category = String(t.category || "").toLowerCase();
    const priority = String(t.priority || "").toLowerCase();
    const confidence = formatConfidence(t.confidence).toLowerCase();
    const created = formatDate(t.created_at).toLowerCase();

    const searchableText = [
      t.id,
      t.title,
      t.description,
      t.category,
      t.priority,
      t.status,
      confidence,
      created
    ].join(" ").toLowerCase();

    const matchesSearch = !searchValue || searchableText.includes(searchValue);
    const matchesStatus = !statusValue || status === statusValue;
    const matchesCategory = !categoryValue || category === categoryValue;
    const matchesPriority = !priorityValue || priority === priorityValue;

    return matchesSearch && matchesStatus && matchesCategory && matchesPriority;
  });

  return sortDashboardTickets(filtered, sortValue);
}

function updateDashboardStats(allTickets, filteredTickets) {
  const totalEl = document.getElementById("statTotal");
  const openEl = document.getElementById("statOpen");
  const resolvedEl = document.getElementById("statResolved");
  const confidenceEl = document.getElementById("statConfidence");

  const total = allTickets.length;
  const open = allTickets.filter(t => String(t.status || "").toLowerCase() === "open").length;
  const resolved = allTickets.filter(t => String(t.status || "").toLowerCase() === "resolved").length;
  const confidenceVals = filteredTickets
    .map(t => normalizeConfidence(t.confidence))
    .filter(v => Number.isFinite(v));

  const avgConfidence = confidenceVals.length
    ? `${(confidenceVals.reduce((a, b) => a + b, 0) / confidenceVals.length).toFixed(1)}%`
    : "--";

  if (totalEl) totalEl.textContent = String(total);
  if (openEl) openEl.textContent = String(open);
  if (resolvedEl) resolvedEl.textContent = String(resolved);
  if (confidenceEl) confidenceEl.textContent = avgConfidence;
}

function updateDashboardMeta(filteredCount, totalCount) {
  const meta = document.getElementById("dashboardMeta");
  if (!meta) return;
  meta.textContent = `Showing ${filteredCount} of ${totalCount} tickets`;
}

function sortDashboardTickets(tickets, sortValue) {
  const sorted = [...tickets];
  if (sortValue === "oldest") {
    return sorted.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }
  if (sortValue === "priority") {
    const rank = { high: 3, medium: 2, low: 1 };
    return sorted.sort((a, b) => (rank[String(b.priority || "").toLowerCase()] || 0) - (rank[String(a.priority || "").toLowerCase()] || 0));
  }
  if (sortValue === "confidence") {
    return sorted.sort((a, b) => normalizeConfidence(b.confidence) - normalizeConfidence(a.confidence));
  }
  return sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}


/* ===============================
   MODAL CONTROL
================================*/
function openModal(ticket){
  document.getElementById("ticketModal").style.display="flex";
  document.getElementById("modalTitle").textContent = ticket.title;
  document.getElementById("m_id").textContent = formatTicketId(ticket.id);
  document.getElementById("m_category").textContent = ticket.category;
  document.getElementById("m_priority").textContent = ticket.priority;
  document.getElementById("m_confidence").textContent = formatConfidence(ticket.confidence);
  document.getElementById("m_status").textContent = ticket.status;
  document.getElementById("m_created").textContent = formatDate(ticket.created_at);
  document.getElementById("m_description").textContent = ticket.description;
}

function closeModal(){
  document.getElementById("ticketModal").style.display="none";
}

function setupPrivacyPolicyPopup() {
  const links = document.querySelectorAll(".privacy-policy-link");
  if (!links.length || document.getElementById("privacyPolicyModal")) return;

  const modal = document.createElement("div");
  modal.id = "privacyPolicyModal";
  modal.className = "policy-modal";
  modal.innerHTML = `
    <div class="policy-modal-card" role="dialog" aria-modal="true" aria-labelledby="policyTitle">
      <div class="policy-modal-head">
        <h2 id="policyTitle">Privacy Policy</h2>
        <button type="button" class="policy-modal-close" aria-label="Close privacy policy">×</button>
      </div>
      <div class="policy-modal-body">
        <p><strong>Last updated:</strong> February 24, 2026</p>
        <p>This Privacy Policy describes how AI Ticket collects, uses, stores, and protects information when you use the application.</p>

        <p><strong>1. Information We Collect</strong></p>
        <ul>
          <li><strong>Account Data:</strong> Name, email address, and account identifiers required for authentication and profile features.</li>
          <li><strong>Ticket Data:</strong> Ticket titles, descriptions, status changes, category predictions, priority predictions, and confidence scores.</li>
          <li><strong>Operational Metadata:</strong> Timestamps, ticket lifecycle events, and user actions needed for dashboard reporting and history tracking.</li>
          <li><strong>Settings Data:</strong> UI preferences such as theme and sorting/date format choices stored locally to personalize your experience.</li>
        </ul>

        <p><strong>2. How We Use Information</strong></p>
        <ul>
          <li>Authenticate users and secure account access.</li>
          <li>Create, route, prioritize, and resolve support tickets.</li>
          <li>Generate AI-assisted ticket categorization and urgency recommendations.</li>
          <li>Provide operational visibility in dashboard, history, and reporting views.</li>
          <li>Maintain system reliability, troubleshooting, and auditability of ticket workflows.</li>
        </ul>

        <p><strong>3. Data Retention</strong></p>
        <p>Ticket and account records are retained as needed for business operations, support continuity, compliance requirements, and service improvement. Retention windows can vary by deployment policy.</p>

        <p><strong>4. Security Controls</strong></p>
        <p>AI Ticket applies reasonable administrative and technical safeguards to protect stored information from unauthorized access, alteration, or misuse. No system can guarantee absolute security, but controls are regularly reviewed as part of operational maintenance.</p>

        <p><strong>5. Sharing and Disclosure</strong></p>
        <p>Data is processed within your application environment and is not sold. Access is limited to authorized contexts required to deliver support operations and maintain the system.</p>

        <p><strong>6. User Rights and Requests</strong></p>
        <p>You may request clarification, correction, or deletion of your account-related data based on your organization’s policy and applicable legal obligations.</p>

        <p><strong>7. Contact</strong></p>
        <p>For privacy-related questions, use the Contact form in Help Center (<code>help.html#contact</code>) and include “Privacy Request” in your message.</p>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const open = (event) => {
    event.preventDefault();
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
  };

  const close = () => {
    modal.classList.remove("open");
    document.body.style.overflow = "";
  };

  links.forEach(link => link.addEventListener("click", open));
  modal.querySelector(".policy-modal-close").addEventListener("click", close);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) close();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.classList.contains("open")) {
      close();
    }
  });
}

function setupAboutPopup() {
  const links = document.querySelectorAll(".about-link");
  if (!links.length || document.getElementById("aboutModal")) return;

  const modal = document.createElement("div");
  modal.id = "aboutModal";
  modal.className = "policy-modal";
  modal.innerHTML = `
    <div class="policy-modal-card" role="dialog" aria-modal="true" aria-labelledby="aboutTitle">
      <div class="policy-modal-head">
        <h2 id="aboutTitle">About AI Ticket</h2>
        <button type="button" class="policy-modal-close" aria-label="Close about popup">×</button>
      </div>
      <div class="policy-modal-body">
        <p>AI Ticket is an intelligent support operations platform built to reduce manual triage effort, improve queue quality, and help teams resolve requests faster with more consistency.</p>
        <p><strong>What AI Ticket does:</strong></p>
        <ul>
          <li>Reads ticket context and predicts category and urgency in real time.</li>
          <li>Provides confidence scoring so agents can quickly validate borderline cases.</li>
          <li>Centralizes open and resolved tickets in one operational dashboard.</li>
          <li>Tracks ticket history for accountability, reporting, and process optimization.</li>
        </ul>
        <p><strong>Operational value:</strong></p>
        <ul>
          <li>Faster first response through automated triage guidance.</li>
          <li>Better prioritization during peak ticket volume.</li>
          <li>More standardized handling across agents and shifts.</li>
          <li>Stronger visibility for managers on workload and outcomes.</li>
        </ul>
        <p><strong>Built for teams:</strong></p>
        <p>The platform is designed for support, IT, and customer operations teams that need reliable workflows, transparent status tracking, and AI assistance without losing human control over final decisions.</p>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const open = (event) => {
    event.preventDefault();
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
  };

  const close = () => {
    modal.classList.remove("open");
    document.body.style.overflow = "";
  };

  links.forEach(link => link.addEventListener("click", open));
  modal.querySelector(".policy-modal-close").addEventListener("click", close);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) close();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.classList.contains("open")) {
      close();
    }
  });
}


/* ===============================
   RESOLVE TICKET
================================*/
async function resolveTicket(id){
  await fetch(`${API_URL}/tickets/${id}`,{method:"PUT"});
  loadDashboard();
}


/* ===============================
   HELPERS
================================*/
function showAlert(message, type) {
  const alertContainer = document.getElementById("alertContainer");
  if (!alertContainer) return;
  alertContainer.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
  setTimeout(() => alertContainer.innerHTML = "", 4000);
}

function formatDate(dateString) {
  const date = new Date(dateString);
  const locale = localStorage.getItem("setting_date_format") || "en-IN";
  return date.toLocaleDateString(locale,{day:"2-digit",month:"short",year:"numeric"});
}

function normalizeConfidence(value) {
  if (value === null || value === undefined) return NaN;

  if (typeof value === "string") {
    const cleaned = value.replace("%", "").trim();
    const parsed = Number.parseFloat(cleaned);
    if (!Number.isFinite(parsed)) return NaN;
    return parsed <= 1 ? parsed * 100 : parsed;
  }

  const n = Number(value);
  if (!Number.isFinite(n)) return NaN;
  return n <= 1 ? n * 100 : n;
}

function formatConfidence(value) {
  const n = normalizeConfidence(value);
  return Number.isFinite(n) ? `${n.toFixed(1)}%` : "--";
}

function getConfidenceClass(value) {
  const n = normalizeConfidence(value);
  if (!Number.isFinite(n)) return "conf-unknown";
  if (n >= 70) return "conf-high";
  if (n >= 45) return "conf-medium";
  return "conf-low";
}

function getStatusClass(status) {
  return String(status || "").toLowerCase().trim().replace(/\s+/g, "-");
}

function getCategoryClass(category) {
  return String(category || "").toLowerCase().trim().replace(/\s+/g, "-");
}

function escapeHTML(str) {
  if (!str) return "";
  return str.replace(/[&<>"']/g, tag => ({
    '&': '&amp;','<': '&lt;','>': '&gt;','"': '&quot;',"'": '&#39;'
  }[tag]));
}

function truncateText(text, maxLength){
  if(!text) return "";
  if(text.length <= maxLength) return escapeHTML(text);
  return escapeHTML(text.substring(0, maxLength)) + "...";
}

function formatTicketId(id) {
  const n = Number.parseInt(id, 10);
  if (!Number.isFinite(n)) return "--";
  return `TKT-${String(n).padStart(4, "0")}`;
}
/* ===============================
   LOGIN HANDLER
================================*/
document.addEventListener("DOMContentLoaded", () => {

  const loginForm = document.getElementById("loginForm");
  if (!loginForm) return;

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();
    const errorBox = document.getElementById("loginError");

    errorBox.textContent = "";

    try {
      const res = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (!res.ok) {
        errorBox.textContent = data.error || "Invalid credentials";
        return;
      }

      // Save user session
      localStorage.setItem("user", JSON.stringify(data.user));

      // Redirect to dashboard
      window.location.href = "dashboard.html";

    } catch (err) {
      errorBox.textContent = "Server not reachable";
    }
  });

});
/* ===============================
   SIGNUP HANDLER
================================*/
document.addEventListener("DOMContentLoaded", () => {

  const signupForm = document.getElementById("signupForm");
  if (!signupForm) return;

  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    const errorBox = document.getElementById("signupError");
    const successBox = document.getElementById("signupSuccess");

    errorBox.textContent = "";
    successBox.textContent = "";

    try {
      const res = await fetch(`${API_URL}/signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ name, email, password })
      });

      const data = await res.json();

      if (!res.ok) {
        errorBox.textContent = data.error || "Signup failed";
        return;
      }

      successBox.textContent = "Signup successful! Redirecting to login...";

      setTimeout(() => {
        window.location.href = "login.html";
      }, 1200);

    } catch {
      errorBox.textContent = "Server not reachable";
    }
  });

});
function showToast(message){
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(()=> toast.classList.add("show"), 50);

  setTimeout(()=>{
    toast.classList.remove("show");
    setTimeout(()=> toast.remove(), 400);
  }, 1500);
}
/* ===============================
   AUTH FUNCTIONS
================================*/

function logout() {
  localStorage.removeItem("user");
  window.location.href = "login.html";
}
